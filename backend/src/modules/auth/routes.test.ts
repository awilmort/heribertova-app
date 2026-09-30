import { Writable } from 'node:stream';
import { request } from '../../../test/http';
import { apiErrorBodySchema } from '@heribertova/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTestApp,
  login,
  loginToken,
  sameOriginHeaders,
  sessionCookie,
  sessionTokenFrom,
} from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { createTestUser, DEFAULT_TEST_PASSWORD, uniqueCedula } from '../../../test/users';
import { createLogger } from '../../lib/logger';
import { hashToken } from '../../lib/token';
import { SessionModel } from '../sessions/model';
import { UserModel } from '../users/model';

useTestDatabase();

const MINUTE = 60 * 1000;
const GENERIC_MESSAGE =
  'No pudimos iniciar su sesión. Verifique su cédula y contraseña e intente nuevamente.';

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

function expectGenericFailure(res: request.Response) {
  expect(res.status).toBe(401);
  expect(apiErrorBodySchema.parse(res.body).error).toEqual({
    code: 'INVALID_CREDENTIALS',
    message: GENERIC_MESSAGE,
  });
  expect(sessionTokenFrom(res)).toBeUndefined();
}

function me(app: ReturnType<typeof buildTestApp>, token: string) {
  return request(app).get('/api/me').set('Cookie', sessionCookie(token));
}

function capturingLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger('info', stream), output: () => lines.join('') };
}

describe('POST /api/auth/login', () => {
  it('opens a session in a __Host-sid cookie (HttpOnly, Secure, SameSite=Lax, Path=/)', async () => {
    const user = await createTestUser({ role: 'team_leader' });
    const res = await login(buildTestApp(), user.username, DEFAULT_TEST_PASSWORD);

    expect(res.status).toBe(204);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0] ?? '';
    expect(cookie).toMatch(/^__Host-sid=[\w-]{43};/);
    expect(cookie).toContain('Max-Age=2592000'); // 30 days
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Domain');
  });

  it('stores the session by token hash, with the client IP and User-Agent', async () => {
    const user = await createTestUser();
    const res = await login(buildTestApp(), user.username, DEFAULT_TEST_PASSWORD).set(
      'User-Agent',
      'Mozilla/5.0 (Linux; Android 14)',
    );
    const token = sessionTokenFrom(res) ?? '';

    const session = await SessionModel.findOne().lean();
    expect(session).toMatchObject({
      tokenHash: hashToken(token),
      userId: user._id,
      ua: 'Mozilla/5.0 (Linux; Android 14)',
    });
    expect(session?.ip).toMatch(/127\.0\.0\.1|::1/);
  });

  it('records the login time and lets the session reach /api/me', async () => {
    const user = await createTestUser();
    const app = buildTestApp();
    const token = await loginToken(app, user.username, DEFAULT_TEST_PASSWORD);

    expect((await UserModel.findById(user._id))?.lastLoginAt?.getTime()).toBe(Date.now());
    const res = await me(app, token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { id: user.id } });
  });

  it('rejects a wrong password with the generic message', async () => {
    const user = await createTestUser();
    expectGenericFailure(await login(buildTestApp(), user.username, 'wrong-password'));
  });

  it('rejects an unknown cédula with the same message', async () => {
    expectGenericFailure(await login(buildTestApp(), uniqueCedula(), DEFAULT_TEST_PASSWORD));
  });

  it('rejects a deactivated account with the same message, even with the right password', async () => {
    const user = await createTestUser({ isActive: false });
    expectGenericFailure(await login(buildTestApp(), user.username, DEFAULT_TEST_PASSWORD));
  });

  describe('progressive lockout', () => {
    async function failTimes(app: ReturnType<typeof buildTestApp>, cedula: string, times: number) {
      for (let i = 0; i < times; i++) expectGenericFailure(await login(app, cedula, 'wrong'));
    }

    it('locks the account for 15 minutes after 5 failures, then unlocks it', async () => {
      const user = await createTestUser();
      const app = buildTestApp();

      await failTimes(app, user.username, 5);
      expect((await UserModel.findById(user._id))?.lockUntil?.getTime()).toBe(
        Date.now() + 15 * MINUTE,
      );

      // Locked: even the right password is refused, with the same message.
      expectGenericFailure(await login(app, user.username, DEFAULT_TEST_PASSWORD));
      advance(15 * MINUTE - 1);
      expectGenericFailure(await login(app, user.username, DEFAULT_TEST_PASSWORD));

      advance(1);
      expect((await login(app, user.username, DEFAULT_TEST_PASSWORD)).status).toBe(204);
      const unlocked = await UserModel.findById(user._id);
      expect(unlocked?.failedAttempts).toBe(0);
      expect(unlocked?.lockUntil).toBeNull();
    });

    it('does not lock after 4 failures, and a success resets the count', async () => {
      const user = await createTestUser();
      const app = buildTestApp();

      await failTimes(app, user.username, 4);
      expect((await login(app, user.username, DEFAULT_TEST_PASSWORD)).status).toBe(204);
      await failTimes(app, user.username, 4);
      expect((await login(app, user.username, DEFAULT_TEST_PASSWORD)).status).toBe(204);
    });

    it('does not extend the lock with attempts made while locked', async () => {
      const user = await createTestUser();
      const app = buildTestApp();
      await failTimes(app, user.username, 5);
      const lockUntil = (await UserModel.findById(user._id))?.lockUntil;

      await failTimes(app, user.username, 3);
      const stored = await UserModel.findById(user._id);
      expect(stored?.lockUntil).toEqual(lockUntil);
      expect(stored?.failedAttempts).toBe(5);
    });

    it('doubles the lock when failures continue after it ends', async () => {
      const user = await createTestUser();
      const app = buildTestApp();

      await failTimes(app, user.username, 5);
      advance(15 * MINUTE);
      await failTimes(app, user.username, 5);
      expect((await UserModel.findById(user._id))?.lockUntil?.getTime()).toBe(
        Date.now() + 30 * MINUTE,
      );

      advance(30 * MINUTE - 1);
      expectGenericFailure(await login(app, user.username, DEFAULT_TEST_PASSWORD));
      advance(1);
      expect((await login(app, user.username, DEFAULT_TEST_PASSWORD)).status).toBe(204);
    });

    it('locks one account without affecting another', async () => {
      const locked = await createTestUser();
      const other = await createTestUser();
      const app = buildTestApp();
      await failTimes(app, locked.username, 5);
      expect((await login(app, other.username, DEFAULT_TEST_PASSWORD)).status).toBe(204);
    });
  });

  describe('per IP + cédula rate limit', () => {
    it('answers 429 once one IP has failed too often for one cédula', async () => {
      const user = await createTestUser();
      const app = buildTestApp({ config: { LOGIN_RATE_LIMIT_MAX: 2 } });

      expectGenericFailure(await login(app, user.username, 'wrong'));
      expectGenericFailure(await login(app, user.username, 'wrong'));
      const res = await login(app, user.username, DEFAULT_TEST_PASSWORD);
      expect(res.status).toBe(429);
      expect(apiErrorBodySchema.parse(res.body).error.code).toBe('RATE_LIMITED');
    });

    it('counts each cédula separately and does not count successful logins', async () => {
      const first = await createTestUser();
      const second = await createTestUser();
      const app = buildTestApp({ config: { LOGIN_RATE_LIMIT_MAX: 2 } });

      expectGenericFailure(await login(app, first.username, 'wrong'));
      expectGenericFailure(await login(app, first.username, 'wrong'));
      for (let i = 0; i < 3; i++) {
        expect((await login(app, second.username, DEFAULT_TEST_PASSWORD)).status).toBe(204);
      }
    });
  });

  it('rejects a malformed request with field errors', async () => {
    const res = await request(buildTestApp())
      .post('/api/auth/login')
      .set(sameOriginHeaders)
      .send({ cedula: '001-1234567-2', password: '' });
    expect(res.status).toBe(400);
    const { error } = apiErrorBodySchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(error.fields ?? {}).sort()).toEqual(['body.cedula', 'body.password']);
  });

  it('rejects a cross-origin login (CSRF guard)', async () => {
    const user = await createTestUser();
    const res = await request(buildTestApp())
      .post('/api/auth/login')
      .set({ ...sameOriginHeaders, Origin: 'https://evil.example' })
      .send({ cedula: user.username, password: DEFAULT_TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('FORBIDDEN');
    await expect(SessionModel.countDocuments()).resolves.toBe(0);
  });

  it('replaces the session the browser already had (fixation) with a new token', async () => {
    const user = await createTestUser();
    const app = buildTestApp();
    const oldToken = await loginToken(app, user.username, DEFAULT_TEST_PASSWORD);

    const res = await login(app, user.username, DEFAULT_TEST_PASSWORD).set(
      'Cookie',
      sessionCookie(oldToken),
    );
    const newToken = sessionTokenFrom(res);

    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(oldToken);
    expect((await me(app, oldToken)).status).toBe(401);
    expect((await me(app, newToken ?? '')).status).toBe(200);
    await expect(SessionModel.countDocuments()).resolves.toBe(1);
  });

  it('logs why a login failed without logging the cédula, password or token', async () => {
    const { logger, output } = capturingLogger();
    const user = await createTestUser();
    const app = buildTestApp({ logger });

    await login(app, user.username, 'wrong-password-123');
    const token = await loginToken(app, user.username, DEFAULT_TEST_PASSWORD);

    const text = output();
    expect(text).toContain('"reason":"wrong_password"');
    expect(text).toContain('Login succeeded');
    expect(text).not.toContain(user.username);
    expect(text).not.toContain('wrong-password-123');
    expect(text).not.toContain(DEFAULT_TEST_PASSWORD);
    expect(text).not.toContain(token);
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session and clears the cookie', async () => {
    const user = await createTestUser();
    const app = buildTestApp();
    const token = await loginToken(app, user.username, DEFAULT_TEST_PASSWORD);

    const res = await request(app)
      .post('/api/auth/logout')
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token));

    expect(res.status).toBe(204);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(
      /^__Host-sid=;.*Expires=Thu, 01 Jan 1970/,
    );
    await expect(SessionModel.countDocuments()).resolves.toBe(0);
    expect((await me(app, token)).status).toBe(401);
  });

  it('succeeds without a session, so a stale cookie can always be cleared', async () => {
    const res = await request(buildTestApp()).post('/api/auth/logout').set(sameOriginHeaders);
    expect(res.status).toBe(204);
  });

  it('only ends the session it was called with', async () => {
    const user = await createTestUser();
    const app = buildTestApp();
    const phone = await loginToken(app, user.username, DEFAULT_TEST_PASSWORD);
    const laptop = await loginToken(app, user.username, DEFAULT_TEST_PASSWORD);

    await request(app)
      .post('/api/auth/logout')
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(phone));
    expect((await me(app, laptop)).status).toBe(200);
  });

  it('rejects a cross-origin logout (CSRF guard)', async () => {
    const user = await createTestUser();
    const app = buildTestApp();
    const token = await loginToken(app, user.username, DEFAULT_TEST_PASSWORD);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'https://evil.example')
      .set('Cookie', sessionCookie(token));
    expect(res.status).toBe(403);
    expect((await me(app, token)).status).toBe(200);
  });
});
