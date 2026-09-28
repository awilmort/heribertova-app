import { randomBytes } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { TEST_TOTP_KEY, totpCodeAt } from '../../../test/totp';
import { createTestUser } from '../../../test/users';
import { hashToken } from '../../lib/token';
import { UserModel } from '../users/model';
import { TotpChallengeModel } from './model';
import {
  requiresTotp,
  startTotpChallenge,
  TOTP_CHALLENGE_MAX_ATTEMPTS,
  TOTP_CHALLENGE_TTL_MS,
  verifyTotpChallenge,
} from './totp';

useTestDatabase();

beforeAll(async () => {
  await TotpChallengeModel.createIndexes();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now());
});

afterEach(() => {
  vi.useRealTimers();
});

const STEP = 30 * 1000;
const wrongCode = () => String((Number(totpCodeAt()) + 1) % 1_000_000).padStart(6, '0');

describe('requiresTotp', () => {
  it('is true for the superadmin only', async () => {
    expect(requiresTotp(await createTestUser({ role: 'superadmin' }))).toBe(true);
    for (const role of [
      'general_coordinator',
      'recinto_coordinator',
      'team_leader',
      'aspiring_leader',
    ] as const) {
      expect(requiresTotp(await createTestUser({ role }))).toBe(false);
    }
  });
});

describe('startTotpChallenge', () => {
  it('stores the token hash, no attempts, and a 5-minute expiry', async () => {
    const user = await createTestUser({ role: 'superadmin' });
    const { token, maxAgeMs } = await startTotpChallenge(user);

    expect(token).toMatch(/^[\w-]{43}$/);
    expect(maxAgeMs).toBe(TOTP_CHALLENGE_TTL_MS);
    expect(TOTP_CHALLENGE_TTL_MS).toBe(5 * 60 * 1000);
    expect(await TotpChallengeModel.findOne().lean()).toMatchObject({
      tokenHash: hashToken(token),
      userId: user._id,
      attempts: 0,
      expiresAt: new Date(Date.now() + TOTP_CHALLENGE_TTL_MS),
    });
  });

  it('keeps one challenge per user, the latest, with its attempts reset', async () => {
    const user = await createTestUser({ role: 'superadmin' });
    const first = await startTotpChallenge(user);
    await verifyTotpChallenge(first.token, wrongCode(), TEST_TOTP_KEY);

    const second = await startTotpChallenge(user);
    const stored = await TotpChallengeModel.find().lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ tokenHash: hashToken(second.token), attempts: 0 });
  });
});

describe('verifyTotpChallenge', () => {
  async function challengeFor(overrides: Parameters<typeof createTestUser>[0] = {}) {
    const user = await createTestUser({ role: 'superadmin', ...overrides });
    const { token } = await startTotpChallenge(user);
    return { user, token };
  }

  it('returns the user for the current code and consumes the challenge', async () => {
    const { user, token } = await challengeFor();
    const result = await verifyTotpChallenge(token, totpCodeAt(), TEST_TOTP_KEY);
    expect(result.ok && result.user.id).toBe(user.id);
    await expect(TotpChallengeModel.countDocuments()).resolves.toBe(0);
    expect((await UserModel.findById(user._id))?.totpLastUsedStep).toBe(
      Math.floor(Date.now() / STEP),
    );
  });

  it('names the reason of each failure (for the logs)', async () => {
    const { token } = await challengeFor();
    await expect(verifyTotpChallenge('x'.repeat(43), totpCodeAt(), TEST_TOTP_KEY)).resolves.toEqual(
      { ok: false, reason: 'no_challenge' },
    );
    await expect(verifyTotpChallenge(token, wrongCode(), TEST_TOTP_KEY)).resolves.toEqual({
      ok: false,
      reason: 'wrong_code',
    });
  });

  it('refuses the code of the step used at enrollment (reused_code)', async () => {
    const { token } = await challengeFor({ totpLastUsedStep: Math.floor(Date.now() / STEP) });
    await expect(verifyTotpChallenge(token, totpCodeAt(), TEST_TOTP_KEY)).resolves.toEqual({
      ok: false,
      reason: 'reused_code',
    });
    vi.setSystemTime(Date.now() + STEP);
    expect((await verifyTotpChallenge(token, totpCodeAt(), TEST_TOTP_KEY)).ok).toBe(true);
  });

  it('refuses a locked account without checking the code or counting a failure', async () => {
    const { user, token } = await challengeFor({
      failedAttempts: 5,
      lockUntil: new Date(Date.now() + 60_000),
    });
    await expect(verifyTotpChallenge(token, totpCodeAt(), TEST_TOTP_KEY)).resolves.toEqual({
      ok: false,
      reason: 'locked',
    });
    expect((await UserModel.findById(user._id))?.failedAttempts).toBe(5);
  });

  it('refuses a deactivated account and drops its challenge', async () => {
    const { user, token } = await challengeFor();
    await UserModel.updateOne({ _id: user._id }, { isActive: false });
    await expect(verifyTotpChallenge(token, totpCodeAt(), TEST_TOTP_KEY)).resolves.toEqual({
      ok: false,
      reason: 'inactive',
    });
    await expect(TotpChallengeModel.countDocuments()).resolves.toBe(0);
  });

  it(`gives up after ${TOTP_CHALLENGE_MAX_ATTEMPTS} codes`, async () => {
    const { token } = await challengeFor();
    for (let i = 0; i < TOTP_CHALLENGE_MAX_ATTEMPTS; i++) {
      await verifyTotpChallenge(token, wrongCode(), TEST_TOTP_KEY);
    }
    await UserModel.updateMany({}, { lockUntil: null });
    await expect(verifyTotpChallenge(token, totpCodeAt(), TEST_TOTP_KEY)).resolves.toEqual({
      ok: false,
      reason: 'no_challenge',
    });
  });

  it('fails loudly when TOTP_ENC_KEY is not the key the secret was encrypted with', async () => {
    const { token } = await challengeFor();
    await expect(verifyTotpChallenge(token, totpCodeAt(), randomBytes(32))).rejects.toThrow();
  });
});

describe('TotpChallengeModel', () => {
  it('indexes challenges by token and by user (both unique), and expires them (TTL)', async () => {
    const indexes = await TotpChallengeModel.collection.indexes();
    const byKey = (key: string) => indexes.find((index) => Object.keys(index.key)[0] === key);
    expect(byKey('tokenHash')).toMatchObject({ unique: true });
    expect(byKey('userId')).toMatchObject({ unique: true });
    expect(byKey('expiresAt')).toMatchObject({ expireAfterSeconds: 0 });
  });
});
