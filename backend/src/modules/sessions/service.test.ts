import mongoose from 'mongoose';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { createTestUser } from '../../../test/users';
import { UserModel } from '../users/model';
import { SessionModel } from './model';
import {
  createSession,
  deleteSession,
  hashSessionToken,
  resolveSession,
  revokeUserSessions,
  SESSION_TOUCH_INTERVAL_MS,
  sessionExpiry,
  sessionLifetime,
} from './service';

useTestDatabase();

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const client = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (Android)' };

describe('sessionLifetime', () => {
  it('gives field users 7 days idle and 30 days absolute', () => {
    for (const role of [
      'general_coordinator',
      'recinto_coordinator',
      'team_leader',
      'aspiring_leader',
    ] as const) {
      expect(sessionLifetime(role)).toEqual({ idleMs: 7 * DAY, absoluteMs: 30 * DAY });
    }
  });

  it('gives the superadmin 12 hours at most', () => {
    expect(sessionLifetime('superadmin')).toEqual({ idleMs: 12 * HOUR, absoluteMs: 12 * HOUR });
  });
});

describe('sessionExpiry', () => {
  const createdAt = new Date('2026-01-01T12:00:00Z');

  it('is the idle deadline while it comes before the absolute one', () => {
    const lastSeenAt = new Date(createdAt.getTime() + DAY);
    expect(sessionExpiry(createdAt, lastSeenAt, 'team_leader')).toEqual(
      new Date(lastSeenAt.getTime() + 7 * DAY),
    );
  });

  it('is capped by the absolute deadline', () => {
    const lastSeenAt = new Date(createdAt.getTime() + 29 * DAY);
    expect(sessionExpiry(createdAt, lastSeenAt, 'team_leader')).toEqual(
      new Date(createdAt.getTime() + 30 * DAY),
    );
  });

  it('is 12 hours after login for the superadmin, however active', () => {
    const lastSeenAt = new Date(createdAt.getTime() + 11 * HOUR);
    expect(sessionExpiry(createdAt, lastSeenAt, 'superadmin')).toEqual(
      new Date(createdAt.getTime() + 12 * HOUR),
    );
  });
});

describe('session store', () => {
  beforeAll(async () => {
    await SessionModel.createIndexes();
  });

  beforeEach(() => {
    // Only Date is faked (drivers keep their real timers). Time starts at the real now and only
    // moves forward, so MongoDB's TTL monitor never sees these sessions as expired.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function advance(ms: number) {
    vi.setSystemTime(Date.now() + ms);
  }

  it('stores only the SHA-256 of a fresh 256-bit token', async () => {
    const user = await createTestUser({ role: 'team_leader' });
    const { token, maxAgeMs } = await createSession(user, client);

    expect(token).toMatch(/^[\w-]{43}$/);
    expect(maxAgeMs).toBe(30 * DAY);
    const stored = await SessionModel.findOne().lean();
    expect(stored).toMatchObject({
      tokenHash: hashSessionToken(token),
      userId: user._id,
      ip: client.ip,
      ua: client.userAgent,
    });
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored?.expiresAt).toEqual(new Date(Date.now() + 7 * DAY));
  });

  it('issues a different token for every session', async () => {
    const user = await createTestUser();
    const first = await createSession(user, client);
    const second = await createSession(user, client);
    expect(first.token).not.toBe(second.token);
  });

  it('truncates a very long User-Agent', async () => {
    const user = await createTestUser();
    await createSession(user, { ip: null, userAgent: 'x'.repeat(5000) });
    const stored = await SessionModel.findOne().lean();
    expect(stored?.ua).toHaveLength(512);
    expect(stored?.ip).toBeNull();
  });

  it('resolves a valid token to its user', async () => {
    const user = await createTestUser();
    const { token } = await createSession(user, client);
    const resolved = await resolveSession(token);
    expect(resolved?.id).toBe(user.id);
  });

  it('resolves an unknown token to null', async () => {
    await expect(resolveSession('A'.repeat(43))).resolves.toBeNull();
  });

  it('writes lastSeenAt at most once a minute', async () => {
    const user = await createTestUser();
    const { token } = await createSession(user, client);
    const loginAt = Date.now();

    advance(SESSION_TOUCH_INTERVAL_MS - 1);
    await resolveSession(token);
    expect((await SessionModel.findOne().lean())?.lastSeenAt.getTime()).toBe(loginAt);

    advance(1);
    await resolveSession(token);
    const touched = await SessionModel.findOne().lean();
    expect(touched?.lastSeenAt.getTime()).toBe(Date.now());
    expect(touched?.expiresAt.getTime()).toBe(Date.now() + 7 * DAY);
  });

  it('expires after 7 idle days, and each request slides that deadline', async () => {
    const user = await createTestUser();
    const { token } = await createSession(user, client);

    advance(6 * DAY);
    await expect(resolveSession(token)).resolves.not.toBeNull();
    advance(7 * DAY - 1);
    await expect(resolveSession(token)).resolves.not.toBeNull();
    advance(7 * DAY);
    await expect(resolveSession(token)).resolves.toBeNull();
  });

  it('expires 30 days after login even when used within every idle window', async () => {
    const user = await createTestUser();
    const { token } = await createSession(user, client);

    // Each use comes before the 7-day idle deadline, so only the absolute deadline can end it.
    // (A handful of uses proves it: every use is a session write on the shared test database.)
    for (let use = 1; use <= 4; use++) {
      advance(6 * DAY);
      await expect(resolveSession(token)).resolves.not.toBeNull();
    }
    advance(6 * DAY - 1);
    await expect(resolveSession(token)).resolves.not.toBeNull();
    advance(1);
    await expect(resolveSession(token)).resolves.toBeNull();
  });

  it('expires a superadmin session 12 hours after login even when active', async () => {
    const user = await createTestUser({ role: 'superadmin' });
    const { token, maxAgeMs } = await createSession(user, client);
    expect(maxAgeMs).toBe(12 * HOUR);

    advance(6 * HOUR);
    await expect(resolveSession(token)).resolves.not.toBeNull();
    advance(6 * HOUR - 1);
    await expect(resolveSession(token)).resolves.not.toBeNull();
    advance(1);
    await expect(resolveSession(token)).resolves.toBeNull();
  });

  it('rejects and deletes the session of a deactivated user', async () => {
    const user = await createTestUser();
    const { token } = await createSession(user, client);
    await UserModel.updateOne({ _id: user._id }, { isActive: false });

    await expect(resolveSession(token)).resolves.toBeNull();
    await expect(SessionModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects the session of a user that no longer exists', async () => {
    const user = await createTestUser();
    const { token } = await createSession(user, client);
    await UserModel.deleteOne({ _id: user._id });
    await expect(resolveSession(token)).resolves.toBeNull();
  });

  it('deletes a session by token, leaving the others', async () => {
    const user = await createTestUser();
    const first = await createSession(user, client);
    const second = await createSession(user, client);

    await deleteSession(first.token);
    await expect(resolveSession(first.token)).resolves.toBeNull();
    await expect(resolveSession(second.token)).resolves.not.toBeNull();
    await expect(deleteSession(first.token)).resolves.toBeUndefined();
  });

  describe('revokeUserSessions', () => {
    it('ends every session of the user, and only theirs', async () => {
      const user = await createTestUser();
      const other = await createTestUser();
      const sessions = [await createSession(user, client), await createSession(user, client)];
      const othersSession = await createSession(other, client);

      await mongoose.connection.transaction((session) => revokeUserSessions(user._id, { session }));

      for (const { token } of sessions) await expect(resolveSession(token)).resolves.toBeNull();
      await expect(resolveSession(othersSession.token)).resolves.not.toBeNull();
    });

    it('keeps the session behind `keepToken`', async () => {
      const user = await createTestUser();
      const kept = await createSession(user, client);
      const ended = await createSession(user, client);

      await mongoose.connection.transaction((session) =>
        revokeUserSessions(user._id, { keepToken: kept.token, session }),
      );

      await expect(resolveSession(kept.token)).resolves.not.toBeNull();
      await expect(resolveSession(ended.token)).resolves.toBeNull();
    });

    it('is undone when the transaction aborts', async () => {
      const user = await createTestUser();
      const { token } = await createSession(user, client);

      await expect(
        mongoose.connection.transaction(async (session) => {
          await revokeUserSessions(user._id, { session });
          throw new Error('the change failed');
        }),
      ).rejects.toThrow('the change failed');

      await expect(resolveSession(token)).resolves.not.toBeNull();
    });
  });

  it('indexes sessions by token (unique), by user, and expires them (TTL on expiresAt)', async () => {
    const indexes = await SessionModel.collection.indexes();
    expect(indexes.find((index) => index.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);
    expect(indexes.find((index) => index.key.tokenHash === 1)?.unique).toBe(true);
    expect(indexes.some((index) => index.key.userId === 1)).toBe(true);
  });
});
