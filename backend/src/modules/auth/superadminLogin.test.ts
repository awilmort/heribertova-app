import { Writable } from 'node:stream';
import { request } from '../../../test/http';
import {
  apiErrorBodySchema,
  meResponseSchema,
  totpRequiredResponseSchema,
} from '@heribertova/shared';
import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTestApp,
  login,
  loginToken,
  sameOriginHeaders,
  sessionCookie,
  sessionTokenFrom,
  superadminChallengeToken,
  testConfig,
  testDependencies,
  totpChallengeCookie,
  totpChallengeTokenFrom,
  verifyTotp,
} from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { totpCodeAt } from '../../../test/totp';
import { createTestUser, DEFAULT_TEST_PASSWORD } from '../../../test/users';
import { createLogger } from '../../lib/logger';
import { hashToken } from '../../lib/token';
import { API_PREFIX } from '../../routing/apiRoute';
import { apiRoutes } from '../../routing/registry';
import { SessionModel } from '../sessions/model';
import { UserModel } from '../users/model';
import { TotpChallengeModel } from './model';

/*
 * The superadmin's two-step login (plan 3.3): the password step opens a TOTP challenge that grants
 * no access, and POST /api/auth/totp/verify turns it into a session.
 */

useTestDatabase();

const MINUTE = 60 * 1000;
const STEP = 30 * 1000;

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

function expectError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(apiErrorBodySchema.parse(res.body).error.code).toBe(code);
  expect(sessionTokenFrom(res)).toBeUndefined();
}

/** Wrong or reused code: the same challenge may be retried. */
const expectWrongCode = (res: request.Response) => expectError(res, 401, 'INVALID_TOTP_CODE');
/** The challenge is gone (or unusable): the login must start over. */
const expectLoginOver = (res: request.Response) => expectError(res, 401, 'UNAUTHENTICATED');

/** A code that is not the current one (nor, by construction, equal to it). */
const wrongCode = () => String((Number(totpCodeAt()) + 1) % 1_000_000).padStart(6, '0');

function me(app: ReturnType<typeof buildTestApp>, token: string) {
  return request(app).get('/api/me').set('Cookie', sessionCookie(token));
}

function setCookies(res: request.Response): string[] {
  return res.headers['set-cookie'] as unknown as string[];
}

/** A superadmin whose password step is done: the challenge token. */
async function passwordStepDone(app = buildTestApp()) {
  const user = await createTestUser({ role: 'superadmin' });
  const challenge = await superadminChallengeToken(app, user.username, DEFAULT_TEST_PASSWORD);
  return { app, user, challenge };
}

describe('superadmin password step', () => {
  it('answers 202 { totpRequired } with a 5-minute challenge cookie and no session', async () => {
    const user = await createTestUser({ role: 'superadmin' });
    const res = await login(buildTestApp(), user.username, DEFAULT_TEST_PASSWORD);

    expect(res.status).toBe(202);
    expect(totpRequiredResponseSchema.parse(res.body)).toEqual({ totpRequired: true });
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^__Host-totp=[\w-]{43};/);
    for (const attribute of ['Max-Age=300', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']) {
      expect(cookies[0]).toContain(attribute);
    }
    expect(cookies[0]).not.toContain('Domain');
    await expect(SessionModel.countDocuments()).resolves.toBe(0);
    expect((await UserModel.findById(user._id))?.lastLoginAt).toBeNull();
  });

  it('stores only the hash of the challenge token', async () => {
    const { user, challenge } = await passwordStepDone();
    const stored = await TotpChallengeModel.findOne().lean();
    expect(stored).toMatchObject({
      tokenHash: hashToken(challenge),
      userId: user._id,
      attempts: 0,
    });
    expect(JSON.stringify(stored)).not.toContain(challenge);
  });

  it('still refuses a wrong password with the generic message and no challenge', async () => {
    const user = await createTestUser({ role: 'superadmin' });
    const res = await login(buildTestApp(), user.username, 'wrong-password');
    expectError(res, 401, 'INVALID_CREDENTIALS');
    expect(totpChallengeTokenFrom(res)).toBeUndefined();
    await expect(TotpChallengeModel.countDocuments()).resolves.toBe(0);
  });

  it('leaves the login of every other role in one step', async () => {
    const user = await createTestUser({ role: 'general_coordinator' });
    const res = await login(buildTestApp(), user.username, DEFAULT_TEST_PASSWORD);
    expect(res.status).toBe(204);
    expect(sessionTokenFrom(res)).toBeDefined();
    expect(totpChallengeTokenFrom(res)).toBeUndefined();
  });
});

describe('the pending TOTP state grants no access', () => {
  const protectedRoutes = apiRoutes(testConfig, testDependencies).filter(
    (route) => route.access !== 'public',
  );
  const anyId = new Types.ObjectId().toHexString();

  it('is checked against every route behind a session', () => {
    expect(protectedRoutes.map((route) => `${route.method} ${route.path}`)).toEqual(
      expect.arrayContaining(['get /me', 'put /me/password', 'post /users/:id/reset-password']),
    );
  });

  it.each(protectedRoutes.map((route) => [`${route.method.toUpperCase()} ${route.path}`, route]))(
    '%s answers 401 to the challenge cookie, and to its token sent as a session',
    async (_label, route) => {
      const { app, challenge } = await passwordStepDone();
      const url = API_PREFIX + route.path.replace(/:\w+/g, anyId);
      for (const cookie of [totpChallengeCookie(challenge), sessionCookie(challenge)]) {
        const res = await request(app)
          [route.method](url)
          .set(sameOriginHeaders)
          .set('Cookie', cookie);
        expectLoginOver(res);
      }
      // Those requests did not consume the challenge: it still serves its one purpose.
      expect((await verifyTotp(app, challenge, totpCodeAt())).status).toBe(204);
    },
  );
});

describe('POST /api/auth/totp/verify', () => {
  it('turns the challenge into a 12-hour session with the current code', async () => {
    const { app, user, challenge } = await passwordStepDone();

    const res = await verifyTotp(app, challenge, totpCodeAt());

    expect(res.status).toBe(204);
    const cookies = setCookies(res);
    expect(cookies.find((c) => c.startsWith('__Host-totp='))).toMatch(
      /^__Host-totp=;.*Expires=Thu, 01 Jan 1970/,
    );
    const session = cookies.find((c) => c.startsWith('__Host-sid=')) ?? '';
    expect(session).toMatch(/^__Host-sid=[\w-]{43};/);
    expect(session).toContain('Max-Age=43200');

    const body = meResponseSchema.parse((await me(app, sessionTokenFrom(res) ?? '')).body);
    expect(body.role).toBe('superadmin');
    await expect(TotpChallengeModel.countDocuments()).resolves.toBe(0);
    expect((await UserModel.findById(user._id))?.lastLoginAt?.getTime()).toBe(Date.now());
  });

  it('accepts the code of the previous 30-second step (clock drift)', async () => {
    const { app, challenge } = await passwordStepDone();
    expect((await verifyTotp(app, challenge, totpCodeAt(Date.now() - STEP))).status).toBe(204);
  });

  it('accepts the code of the next 30-second step (clock drift)', async () => {
    const { app, challenge } = await passwordStepDone();
    expect((await verifyTotp(app, challenge, totpCodeAt(Date.now() + STEP))).status).toBe(204);
  });

  it('refuses a code two steps away', async () => {
    const { app, challenge } = await passwordStepDone();
    expectWrongCode(await verifyTotp(app, challenge, totpCodeAt(Date.now() - 2 * STEP)));
    expectWrongCode(await verifyTotp(app, challenge, totpCodeAt(Date.now() + 2 * STEP)));
  });

  it('refuses a wrong code; the same challenge then accepts the right one', async () => {
    const { app, user, challenge } = await passwordStepDone();

    expectWrongCode(await verifyTotp(app, challenge, wrongCode()));
    expect((await UserModel.findById(user._id))?.failedAttempts).toBe(1);
    await expect(SessionModel.countDocuments()).resolves.toBe(0);

    expect((await verifyTotp(app, challenge, totpCodeAt())).status).toBe(204);
    expect((await UserModel.findById(user._id))?.failedAttempts).toBe(0);
  });

  it('never accepts a code twice (replay), even on a new challenge', async () => {
    const { app, user, challenge } = await passwordStepDone();
    const code = totpCodeAt();
    expect((await verifyTotp(app, challenge, code)).status).toBe(204);

    const again = await superadminChallengeToken(app, user.username, DEFAULT_TEST_PASSWORD);
    expectWrongCode(await verifyTotp(app, again, code));
    // Nor an older code once a newer one was used.
    expectWrongCode(await verifyTotp(app, again, totpCodeAt(Date.now() - STEP)));

    advance(STEP);
    expect((await verifyTotp(app, again, totpCodeAt())).status).toBe(204);
  });

  it('lets only one of two simultaneous requests with the same code through', async () => {
    const { app, challenge } = await passwordStepDone();
    const code = totpCodeAt();
    const results = await Promise.all([
      verifyTotp(app, challenge, code),
      verifyTotp(app, challenge, code),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([204, 401]);
    await expect(SessionModel.countDocuments()).resolves.toBe(1);
  });

  it('expires the challenge after 5 minutes, and clears its cookie', async () => {
    const { app, challenge } = await passwordStepDone();
    advance(5 * MINUTE);
    const res = await verifyTotp(app, challenge, totpCodeAt());
    expectLoginOver(res);
    expect(setCookies(res)[0]).toMatch(/^__Host-totp=;/);
  });

  it('accepts the code until the challenge expires', async () => {
    const { app, challenge } = await passwordStepDone();
    advance(5 * MINUTE - 1);
    expect((await verifyTotp(app, challenge, totpCodeAt())).status).toBe(204);
  });

  it('refuses a request without a challenge, or with an unknown one', async () => {
    await createTestUser({ role: 'superadmin' });
    const app = buildTestApp();
    expectLoginOver(await verifyTotp(app, null, totpCodeAt()));
    expectLoginOver(await verifyTotp(app, 'x'.repeat(43), totpCodeAt()));
  });

  it('refuses a session token in place of the challenge', async () => {
    const user = await createTestUser({ role: 'team_leader' });
    const app = buildTestApp();
    const session = await loginToken(app, user.username, DEFAULT_TEST_PASSWORD);
    const res = await request(app)
      .post('/api/auth/totp/verify')
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(session))
      .send({ code: totpCodeAt() });
    expectLoginOver(res);
  });

  it('replaces the open challenge when the password step is repeated', async () => {
    const { app, user, challenge } = await passwordStepDone();
    const second = await superadminChallengeToken(app, user.username, DEFAULT_TEST_PASSWORD);

    expectLoginOver(await verifyTotp(app, challenge, totpCodeAt()));
    await expect(TotpChallengeModel.countDocuments()).resolves.toBe(1);
    expect((await verifyTotp(app, second, totpCodeAt())).status).toBe(204);
  });

  it('refuses a superadmin deactivated between the two steps', async () => {
    const { app, user, challenge } = await passwordStepDone();
    await UserModel.updateOne({ _id: user._id }, { isActive: false });
    expectLoginOver(await verifyTotp(app, challenge, totpCodeAt()));
    await expect(TotpChallengeModel.countDocuments()).resolves.toBe(0);
  });

  it('drops the session the browser already had (fixation)', async () => {
    const other = await createTestUser({ role: 'team_leader' });
    const { app, challenge } = await passwordStepDone();
    const oldSession = await loginToken(app, other.username, DEFAULT_TEST_PASSWORD);

    const res = await request(app)
      .post('/api/auth/totp/verify')
      .set(sameOriginHeaders)
      .set('Cookie', [totpChallengeCookie(challenge), sessionCookie(oldSession)].join('; '))
      .send({ code: totpCodeAt() });

    expect(res.status).toBe(204);
    expect((await me(app, oldSession)).status).toBe(401);
  });

  it('rejects a malformed code with a field error, without using an attempt', async () => {
    const { app, challenge } = await passwordStepDone();
    const res = await verifyTotp(app, challenge, '12 34');
    expectError(res, 400, 'VALIDATION_ERROR');
    expect(apiErrorBodySchema.parse(res.body).error.fields).toEqual({
      'body.code': ['Ingrese los 6 dígitos del código.'],
    });
    expect((await TotpChallengeModel.findOne())?.attempts).toBe(0);
  });

  it('rejects a cross-origin request (CSRF guard)', async () => {
    const { app, challenge } = await passwordStepDone();
    const res = await request(app)
      .post('/api/auth/totp/verify')
      .set({ ...sameOriginHeaders, Origin: 'https://evil.example' })
      .set('Cookie', totpChallengeCookie(challenge))
      .send({ code: totpCodeAt() });
    expectError(res, 403, 'FORBIDDEN');
    await expect(SessionModel.countDocuments()).resolves.toBe(0);
  });

  it('logs why a code failed, never the code or the tokens', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const { app, challenge } = await passwordStepDone(
      buildTestApp({ logger: createLogger('info', stream) }),
    );
    const wrong = wrongCode();
    await verifyTotp(app, challenge, wrong);
    const session = sessionTokenFrom(await verifyTotp(app, challenge, totpCodeAt())) ?? '';

    const text = lines.join('');
    expect(text).toContain('"reason":"wrong_code"');
    expect(text).toContain('Login succeeded');
    expect(text).not.toContain(wrong);
    expect(text).not.toContain(challenge);
    expect(text).not.toContain(session);
  });

  describe('guessing limits', () => {
    it('counts wrong codes toward the account lockout: 5 lock it for 15 minutes', async () => {
      const { app, user, challenge } = await passwordStepDone();
      for (let i = 0; i < 5; i++) expectWrongCode(await verifyTotp(app, challenge, wrongCode()));

      expect((await UserModel.findById(user._id))?.lockUntil?.getTime()).toBe(
        Date.now() + 15 * MINUTE,
      );
      // Locked: the password step is refused like any login during a lockout.
      expectError(
        await login(app, user.username, DEFAULT_TEST_PASSWORD),
        401,
        'INVALID_CREDENTIALS',
      );

      advance(15 * MINUTE);
      const next = await superadminChallengeToken(app, user.username, DEFAULT_TEST_PASSWORD);
      expect((await verifyTotp(app, next, totpCodeAt())).status).toBe(204);
    });

    it('does not reset the failures on a right password alone', async () => {
      const { app, user, challenge } = await passwordStepDone();
      for (let i = 0; i < 4; i++) expectWrongCode(await verifyTotp(app, challenge, wrongCode()));

      const second = await superadminChallengeToken(app, user.username, DEFAULT_TEST_PASSWORD);
      expect((await UserModel.findById(user._id))?.failedAttempts).toBe(4);
      expectWrongCode(await verifyTotp(app, second, wrongCode()));
      expect((await UserModel.findById(user._id))?.lockUntil?.getTime()).toBe(
        Date.now() + 15 * MINUTE,
      );
    });

    it('refuses every code while the account is locked, even the right one', async () => {
      const { app, user, challenge } = await passwordStepDone();
      await UserModel.updateOne({ _id: user._id }, { lockUntil: new Date(Date.now() + MINUTE) });
      expectLoginOver(await verifyTotp(app, challenge, totpCodeAt()));
    });

    it('takes at most 5 codes per challenge, even with the lockout lifted', async () => {
      const { app, user, challenge } = await passwordStepDone();
      for (let i = 0; i < 5; i++) expectWrongCode(await verifyTotp(app, challenge, wrongCode()));
      await UserModel.updateOne({ _id: user._id }, { lockUntil: null, failedAttempts: 0 });

      expectLoginOver(await verifyTotp(app, challenge, totpCodeAt()));
    });

    it('caps a challenge at 5 codes even when they arrive at once', async () => {
      const { app, user, challenge } = await passwordStepDone();
      const results = await Promise.all(
        Array.from({ length: 12 }, () => verifyTotp(app, challenge, wrongCode())),
      );
      const codes = results.map((res) => apiErrorBodySchema.parse(res.body).error.code);
      expect(codes.filter((code) => code === 'INVALID_TOTP_CODE')).toHaveLength(5);
      expect(codes.filter((code) => code === 'UNAUTHENTICATED')).toHaveLength(7);
      expect((await UserModel.findById(user._id))?.failedAttempts).toBe(5);
    });

    it('answers 429 once one IP has sent too many wrong codes', async () => {
      const { app, challenge } = await passwordStepDone(
        buildTestApp({ config: { LOGIN_RATE_LIMIT_MAX: 2 } }),
      );
      expectWrongCode(await verifyTotp(app, challenge, wrongCode()));
      expectWrongCode(await verifyTotp(app, challenge, wrongCode()));
      expectError(await verifyTotp(app, challenge, totpCodeAt()), 429, 'RATE_LIMITED');
    });
  });
});
