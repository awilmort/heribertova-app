import { request } from '../../../test/http';
import { apiErrorBodySchema, meResponseSchema, ROLE_PERMISSIONS, ROLES } from '@heribertova/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTestApp,
  login,
  loginToken,
  sameOriginHeaders,
  sessionCookie,
  superadminLoginToken,
} from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { createTestUser, DEFAULT_TEST_PASSWORD } from '../../../test/users';
import { AuditLogModel } from '../audit/model';
import { PersonModel } from '../people/model';
import { UserModel } from '../users/model';
import { landingFor } from './landing';

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
  const logIn = user.role === 'superadmin' ? superadminLoginToken : loginToken;
  return { user, token: await logIn(app, user.username, DEFAULT_TEST_PASSWORD) };
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
      permissions: [...ROLE_PERMISSIONS.recinto_coordinator],
      landing: '/panel/general',
      usingDefaultPassword: true,
    });
  });

  it.each(ROLES)('returns the permissions and landing page of a %s', async (role) => {
    const { token } = await loggedIn({ role });
    const body = meResponseSchema.parse((await me(token)).body);
    expect(body.role).toBe(role);
    expect(body.permissions).toEqual(ROLE_PERMISSIONS[role]);
    expect(body.landing).toBe(landingFor(role));
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

    // Each request below slides the session, which is a write on the test database shared by every
    // test file. Requests are spaced just inside the idle window rather than daily/hourly: a few
    // prove the same thing, and a long chain of writes timed out under full-suite load.
    it('expires 30 days after login even for a user active every few days', async () => {
      const { token } = await loggedIn();
      for (let request = 1; request <= 4; request++) {
        advance(6 * DAY);
        expect((await me(token)).status).toBe(200);
      }
      advance(6 * DAY - 1);
      expect((await me(token)).status).toBe(200);
      advance(1);
      expectUnauthenticated(await me(token));
    });

    it('expires a superadmin session 12 hours after login, however active', async () => {
      const { token } = await loggedIn({ role: 'superadmin' });
      for (let request = 1; request <= 2; request++) {
        advance(4 * HOUR);
        expect((await me(token)).status).toBe(200);
      }
      advance(4 * HOUR - 1);
      expect((await me(token)).status).toBe(200);
      advance(1);
      expectUnauthenticated(await me(token));
    });
  });
});

describe('PUT /api/me/password', () => {
  const NEW_PASSWORD = 'mi-clave-nueva';

  function changePassword(token: string | null, body: object) {
    const req = request(app).put('/api/me/password').set(sameOriginHeaders).send(body);
    return token ? req.set('Cookie', sessionCookie(token)) : req;
  }

  function change(token: string, newPassword = NEW_PASSWORD) {
    return changePassword(token, { currentPassword: DEFAULT_TEST_PASSWORD, newPassword });
  }

  function expectFieldError(res: request.Response, field: string, message: string) {
    expect(res.status).toBe(400);
    expect(apiErrorBodySchema.parse(res.body).error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: { [field]: [message] },
    });
  }

  /** The password, the default flag and the other session are as before the refused change. */
  async function expectUnchanged(user: { username: string }, otherToken: string) {
    expect((await login(app, user.username, DEFAULT_TEST_PASSWORD)).status).toBe(204);
    expect((await me(otherToken)).status).toBe(200);
    expect((await me(otherToken)).body).toMatchObject({ usingDefaultPassword: true });
    await expect(AuditLogModel.countDocuments()).resolves.toBe(0);
  }

  it('replaces the password: the new one works, the old one no longer does', async () => {
    const { user, token } = await loggedIn();

    expect((await change(token)).status).toBe(204);

    expect((await login(app, user.username, NEW_PASSWORD)).status).toBe(204);
    expect((await login(app, user.username, DEFAULT_TEST_PASSWORD)).status).toBe(401);
  });

  it('stops reporting the default password', async () => {
    const { token } = await loggedIn();
    await change(token);
    expect((await me(token)).body).toMatchObject({ usingDefaultPassword: false });
  });

  it('ends every other session of the user and keeps the current one', async () => {
    const { user, token } = await loggedIn();
    const otherDevice = await loginToken(app, user.username, DEFAULT_TEST_PASSWORD);
    const someoneElse = await loggedIn();

    expect((await change(token)).status).toBe(204);

    expect((await me(token)).status).toBe(200);
    expectUnauthenticated(await me(otherDevice));
    expect((await me(someoneElse.token)).status).toBe(200);
  });

  it('records the change in the audit log', async () => {
    const { user, token } = await loggedIn();
    await change(token);
    const entries = await AuditLogModel.find().lean();
    expect(entries).toEqual([
      expect.objectContaining({
        actorUserId: user._id,
        action: 'user.password_changed',
        entity: 'user',
        entityId: user._id,
        summary: 'Cambió su contraseña.',
      }),
    ]);
  });

  it('requires the current password, changing nothing when it is wrong', async () => {
    const { user, token } = await loggedIn();
    const otherDevice = await loginToken(app, user.username, DEFAULT_TEST_PASSWORD);

    const res = await changePassword(token, {
      currentPassword: 'no-es-la-actual',
      newPassword: NEW_PASSWORD,
    });

    expectFieldError(res, 'body.currentPassword', 'La contraseña actual no es correcta.');
    await expectUnchanged(user, otherDevice);
  });

  it('refuses a new password shorter than 8 characters', async () => {
    const { token } = await loggedIn();
    expectFieldError(
      await change(token, '1234567'),
      'body.newPassword',
      'La contraseña debe tener al menos 8 caracteres.',
    );
    expect((await change(token, '12345678')).status).toBe(204);
  });

  it.each(['15031985', '15/03/1985', '15-03-1985', '1985-03-15', '19850315'])(
    'refuses the birth date written as %j, changing nothing',
    async (birthDate) => {
      // createTestUser's person was born on 1985-03-15.
      const { user, token } = await loggedIn();
      const otherDevice = await loginToken(app, user.username, DEFAULT_TEST_PASSWORD);

      expectFieldError(
        await change(token, birthDate),
        'body.newPassword',
        'La nueva contraseña no puede ser su fecha de nacimiento.',
      );
      await expectUnchanged(user, otherDevice);
    },
  );

  it('requires at least 14 characters from the superadmin', async () => {
    const { token } = await loggedIn({ role: 'superadmin' });
    expectFieldError(
      await change(token, 'x'.repeat(13)),
      'body.newPassword',
      'La contraseña debe tener al menos 14 caracteres.',
    );
    expect((await change(token, 'x'.repeat(14))).status).toBe(204);
  });

  it('validates the body', async () => {
    const { token } = await loggedIn();
    const res = await changePassword(token, {});
    expect(res.status).toBe(400);
    expect(Object.keys(apiErrorBodySchema.parse(res.body).error.fields ?? {}).sort()).toEqual([
      'body.currentPassword',
      'body.newPassword',
    ]);
  });

  it('requires a session', async () => {
    expectUnauthenticated(
      await changePassword(null, {
        currentPassword: DEFAULT_TEST_PASSWORD,
        newPassword: 'x'.repeat(8),
      }),
    );
  });

  it('refuses a cross-origin request', async () => {
    const { token } = await loggedIn();
    const res = await request(app)
      .put('/api/me/password')
      .set({ ...sameOriginHeaders, Origin: 'https://evil.example' })
      .set('Cookie', sessionCookie(token))
      .send({ currentPassword: DEFAULT_TEST_PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(403);
    expect((await me(token)).body).toMatchObject({ usingDefaultPassword: true });
  });

  it('pauses a user after 10 failed attempts in 15 minutes, so the current password cannot be guessed', async () => {
    const { token } = await loggedIn();
    const wrong = { currentPassword: 'adivinanza', newPassword: NEW_PASSWORD };
    for (let attempt = 1; attempt <= 10; attempt++) {
      expect((await changePassword(token, wrong)).status).toBe(400);
    }

    const res = await change(token);
    expect(res.status).toBe(429);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('RATE_LIMITED');

    // Other users are not affected.
    const other = await loggedIn();
    expect((await change(other.token)).status).toBe(204);
  });
});
