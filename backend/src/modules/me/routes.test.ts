import request from 'supertest';
import { apiErrorBodySchema, meResponseSchema } from '@heribertova/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp, loginToken, sessionCookie } from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { createTestUser, DEFAULT_TEST_PASSWORD } from '../../../test/users';
import { PersonModel } from '../people/model';
import { UserModel } from '../users/model';

useTestDatabase();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

beforeEach(() => {
  // Only Date is faked; time starts at the real now and only moves forward (see sessions tests).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now());
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

const app = buildTestApp();

function me(token?: string) {
  const req = request(app).get('/api/me');
  return token ? req.set('Cookie', sessionCookie(token)) : req;
}

function expectUnauthenticated(res: request.Response) {
  expect(res.status).toBe(401);
  expect(apiErrorBodySchema.parse(res.body).error.code).toBe('UNAUTHENTICATED');
}

function expectCookieCleared(res: request.Response) {
  expect((res.headers['set-cookie'] as unknown as string[] | undefined)?.[0]).toMatch(
    /^__Host-sid=;.*Expires=Thu, 01 Jan 1970/,
  );
}

async function loggedIn(options: Parameters<typeof createTestUser>[0] = {}) {
  const user = await createTestUser(options);
  return { user, token: await loginToken(app, user.username, DEFAULT_TEST_PASSWORD) };
}

describe('GET /api/me', () => {
  it('returns the user, the person behind the account and the role', async () => {
    const { user, token } = await loggedIn({ role: 'recinto_coordinator' });
    await PersonModel.updateOne({ _id: user.personId }, { nickname: 'Juancito' });

    const res = await me(token);

    expect(res.status).toBe(200);
    expect(meResponseSchema.parse(res.body)).toEqual({
      user: { id: user.id, username: user.username },
      person: {
        id: user.personId.toHexString(),
        fullName: 'JUAN PÉREZ SANTANA',
        nickname: 'Juancito',
        recintoKey: 'liceo-juan-pablo-duarte--centro-ciudad',
        recintoName: 'LICEO JUAN PABLO DUARTE',
        colegioId: 4675,
        sector: 'CENTRO CIUDAD',
      },
      role: 'recinto_coordinator',
      usingDefaultPassword: true,
    });
  });

  it('reports whether the default password is still in use', async () => {
    const { token } = await loggedIn({ usingDefaultPassword: false });
    expect((await me(token)).body).toMatchObject({ usingDefaultPassword: false });
  });

  it('never exposes the password hash or lockout state', async () => {
    const { token } = await loggedIn();
    const text = JSON.stringify((await me(token)).body);
    expect(text).not.toMatch(/passwordHash|argon2|failedAttempts|lockUntil/);
  });

  it('rejects a request without a session cookie', async () => {
    expectUnauthenticated(await me());
  });

  it('rejects an unknown token and clears the cookie', async () => {
    const res = await me('A'.repeat(43));
    expectUnauthenticated(res);
    expectCookieCleared(res);
  });

  it('rejects a malformed cookie without looking it up', async () => {
    const res = await request(app).get('/api/me').set('Cookie', '__Host-sid=not-a-token');
    expectUnauthenticated(res);
  });

  it('rejects the session of a user deactivated mid-session', async () => {
    const { user, token } = await loggedIn();
    expect((await me(token)).status).toBe(200);

    await UserModel.updateOne({ _id: user._id }, { isActive: false });
    const res = await me(token);
    expectUnauthenticated(res);
    expectCookieCleared(res);

    // Reactivating does not revive the old session: it was deleted.
    await UserModel.updateOne({ _id: user._id }, { isActive: true });
    expectUnauthenticated(await me(token));
  });

  describe('session expiry', () => {
    it('expires after 7 idle days; activity slides the deadline', async () => {
      const { token } = await loggedIn();

      advance(7 * DAY - 1);
      expect((await me(token)).status).toBe(200);
      advance(7 * DAY - 1);
      expect((await me(token)).status).toBe(200);
      advance(7 * DAY);
      const res = await me(token);
      expectUnauthenticated(res);
      expectCookieCleared(res);
    });

    it('expires 30 days after login even for a daily user', async () => {
      const { token } = await loggedIn();
      for (let day = 1; day < 30; day++) {
        advance(DAY);
        expect((await me(token)).status).toBe(200);
      }
      advance(DAY);
      expectUnauthenticated(await me(token));
    });

    it('expires a superadmin session 12 hours after login, however active', async () => {
      const { token } = await loggedIn({ role: 'superadmin' });
      for (let hour = 1; hour < 12; hour++) {
        advance(HOUR);
        expect((await me(token)).status).toBe(200);
      }
      advance(HOUR);
      expectUnauthenticated(await me(token));
    });
  });
});
