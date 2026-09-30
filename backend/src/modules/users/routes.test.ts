import { request } from '../../../test/http';
import {
  apiErrorBodySchema,
  userListResponseSchema,
  type AppointUserRequest,
  type Role,
} from '@heribertova/shared';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, login, sameOriginHeaders, sessionCookie } from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { importFakePadron } from '../../../test/padron';
import { createTestLogin, createTestPerson, createTestUser } from '../../../test/users';
import { AuditLogModel } from '../audit/model';
import { PersonModel, type Person } from '../people/model';
import { RecintoModel } from '../recintos/model';
import { SessionModel } from '../sessions/model';
import { createSession, resolveSession } from '../sessions/service';
import type { RawVoterRecord } from '../voters/voterFile';
import { VoterModel, type Voter } from '../voters/model';
import { UserModel, type UserDocument } from './model';

useTestDatabase();

const app = buildTestApp();

const RECINTO = 'liceo-juan-pablo-duarte--centro-ciudad';
const OTHER_RECINTO = 'escuela-primaria-rural--juanillo';
/** The password the target chose, and then forgot. */
const FORGOTTEN_PASSWORD = 'clave-olvidada';
const BIRTH_DATE = '1979-11-02';
const BIRTH_DATE_PASSWORD = '02111979';

function snapshot(recintoKey: string): Person['voterSnapshot'] {
  return {
    fullName: 'MARÍA RODRÍGUEZ',
    recintoKey,
    recintoName: recintoKey.toUpperCase(),
    colegioId: 4675,
    sector: 'CENTRO',
    birthDate: BIRTH_DATE,
  };
}

/** A user who logs in, and a session of theirs to call the API with. */
async function caller(role: Role, recintoScopes: string[] = []) {
  const user = await createTestUser({ role, recintoScopes });
  const { token } = await createSession(user, { ip: null, userAgent: null });
  return { user, token };
}

/**
 * The account whose password is reset: born on BIRTH_DATE, voting in `recintoKey`, on their own
 * password (FORGOTTEN_PASSWORD), under `leader` when given.
 */
async function target(
  role: Role,
  { recintoKey = OTHER_RECINTO, leader }: { recintoKey?: string; leader?: UserDocument } = {},
): Promise<UserDocument> {
  const person = await createTestPerson({
    registeredBy: new Types.ObjectId(),
    voterSnapshot: snapshot(recintoKey),
    leaderId: leader?.personId ?? null,
    ancestors: leader ? [leader.personId] : [],
  });
  return createTestLogin(person, {
    role,
    password: FORGOTTEN_PASSWORD,
    usingDefaultPassword: false,
  });
}

function resetPassword(token: string | null, userId: string) {
  const req = request(app).post(`/api/users/${userId}/reset-password`).set(sameOriginHeaders);
  return token ? req.set('Cookie', sessionCookie(token)) : req;
}

function expectError(res: request.Response, status: number, code: string, message?: string) {
  expect(res.status).toBe(status);
  const { error } = apiErrorBodySchema.parse(res.body);
  expect(error.code).toBe(code);
  if (message) expect(error.message).toBe(message);
}

/** The target's password, lock and sessions are exactly as before the refused request. */
async function expectUnchanged(user: UserDocument, sessionToken: string) {
  const stored = await UserModel.findById(user._id).lean();
  expect(stored?.passwordHash).toBe(user.passwordHash);
  expect(stored?.usingDefaultPassword).toBe(user.usingDefaultPassword);
  await expect(resolveSession(sessionToken)).resolves.not.toBeNull();
  await expect(AuditLogModel.countDocuments()).resolves.toBe(0);
}

const NOT_IN_SCOPE = 'No tiene acceso a esta persona.';
const OUTRANKED = 'No puede restablecer la contraseña de este usuario.';

describe('POST /api/users/:id/reset-password', () => {
  it('puts the password back on the birth date: the old one fails, the birth date works', async () => {
    const { token } = await caller('general_coordinator');
    const user = await target('team_leader');
    expect((await login(app, user.username, FORGOTTEN_PASSWORD)).status).toBe(204);

    const res = await resetPassword(token, user.id);

    expect(res.status).toBe(204);
    expect((await login(app, user.username, FORGOTTEN_PASSWORD)).status).toBe(401);
    expect((await login(app, user.username, BIRTH_DATE_PASSWORD)).status).toBe(204);
    const stored = await UserModel.findById(user._id).lean();
    expect(stored?.usingDefaultPassword).toBe(true);
  });

  it('unlocks a locked account', async () => {
    const { token } = await caller('general_coordinator');
    const user = await target('aspiring_leader');
    await UserModel.updateOne(
      { _id: user._id },
      { failedAttempts: 10, lockUntil: new Date(Date.now() + 60 * 60 * 1000) },
    );

    expect((await resetPassword(token, user.id)).status).toBe(204);

    const stored = await UserModel.findById(user._id).lean();
    expect(stored).toMatchObject({ failedAttempts: 0, lockUntil: null });
    expect((await login(app, user.username, BIRTH_DATE_PASSWORD)).status).toBe(204);
  });

  it("ends every session of the user, and none of the caller's", async () => {
    const { user: coordinator, token } = await caller('general_coordinator');
    const user = await target('team_leader');
    const sessions = [
      await createSession(user, { ip: null, userAgent: null }),
      await createSession(user, { ip: null, userAgent: null }),
    ];

    expect((await resetPassword(token, user.id)).status).toBe(204);

    for (const session of sessions) {
      await expect(resolveSession(session.token)).resolves.toBeNull();
    }
    await expect(SessionModel.countDocuments({ userId: user._id })).resolves.toBe(0);
    await expect(resolveSession(token)).resolves.toMatchObject({ id: coordinator.id });
  });

  it('records the reset in the audit log, with the cédula masked', async () => {
    const { user: coordinator, token } = await caller('general_coordinator');
    const user = await target('team_leader');

    await resetPassword(token, user.id);

    const entries = await AuditLogModel.find().lean();
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({
      actorUserId: coordinator._id,
      action: 'user.password_reset',
      entity: 'user',
      entityId: user._id,
    });
    expect(entry?.ip).toEqual(expect.any(String));
    const masked = `${user.username.slice(0, 3)}-*******-${user.username.slice(-1)}`;
    expect(entry?.summary).toBe(`Restableció a la fecha de nacimiento la contraseña de ${masked}.`);
    expect(entry?.summary).not.toContain(user.username);
  });

  describe('scope', () => {
    it('lets a recinto coordinator reset a leader who votes in one of their recintos', async () => {
      const { token } = await caller('recinto_coordinator', [RECINTO]);
      const user = await target('team_leader', { recintoKey: RECINTO });
      expect((await resetPassword(token, user.id)).status).toBe(204);
      expect((await login(app, user.username, BIRTH_DATE_PASSWORD)).status).toBe(204);
    });

    it('lets a recinto coordinator reset a leader of their own team in another recinto', async () => {
      const { user: coordinator, token } = await caller('recinto_coordinator', [RECINTO]);
      const user = await target('aspiring_leader', {
        recintoKey: OTHER_RECINTO,
        leader: coordinator,
      });
      expect((await resetPassword(token, user.id)).status).toBe(204);
    });

    it('refuses a recinto coordinator a leader out of their scope, changing nothing', async () => {
      const { token } = await caller('recinto_coordinator', [RECINTO]);
      const user = await target('team_leader', { recintoKey: OTHER_RECINTO });
      const session = await createSession(user, { ip: null, userAgent: null });

      expectError(await resetPassword(token, user.id), 403, 'FORBIDDEN', NOT_IN_SCOPE);
      await expectUnchanged(user, session.token);
      expect((await login(app, user.username, FORGOTTEN_PASSWORD)).status).toBe(204);
    });

    it('lets a general coordinator and the superadmin reset leaders anywhere', async () => {
      for (const role of ['general_coordinator', 'superadmin'] as const) {
        const { token } = await caller(role);
        const user = await target('team_leader', { recintoKey: OTHER_RECINTO });
        expect((await resetPassword(token, user.id)).status).toBe(204);
      }
    });

    it.each(['team_leader', 'aspiring_leader'] as const)(
      'refuses a %s, even for someone on their own team',
      async (role) => {
        const { user: leader, token } = await caller(role);
        const user = await target('aspiring_leader', { recintoKey: RECINTO, leader });
        const session = await createSession(user, { ip: null, userAgent: null });

        expectError(await resetPassword(token, user.id), 403, 'FORBIDDEN');
        await expectUnchanged(user, session.token);
      },
    );
  });

  describe('rank', () => {
    it('never lets a general coordinator reset the superadmin', async () => {
      const { token } = await caller('general_coordinator');
      const superadmin = await createTestUser({ role: 'superadmin' });
      const session = await createSession(superadmin, { ip: null, userAgent: null });

      expectError(await resetPassword(token, superadmin.id), 403, 'FORBIDDEN', OUTRANKED);
      await expectUnchanged(superadmin, session.token);
    });

    it('does not let the superadmin reset its own password to a birth date', async () => {
      const { user: superadmin, token } = await caller('superadmin');
      expectError(await resetPassword(token, superadmin.id), 403, 'FORBIDDEN', OUTRANKED);
      await expectUnchanged(superadmin, token);
    });

    it('refuses a peer: a general coordinator cannot reset another one', async () => {
      const { token } = await caller('general_coordinator');
      const user = await target('general_coordinator');
      const session = await createSession(user, { ip: null, userAgent: null });

      expectError(await resetPassword(token, user.id), 403, 'FORBIDDEN', OUTRANKED);
      await expectUnchanged(user, session.token);
    });

    it.each(['general_coordinator', 'recinto_coordinator'] as const)(
      'refuses a recinto coordinator a %s voting in their recinto (in scope, not outranked)',
      async (role) => {
        const { token } = await caller('recinto_coordinator', [RECINTO]);
        const user = await target(role, { recintoKey: RECINTO });
        const session = await createSession(user, { ip: null, userAgent: null });

        expectError(await resetPassword(token, user.id), 403, 'FORBIDDEN', OUTRANKED);
        await expectUnchanged(user, session.token);
      },
    );

    it('lets the superadmin reset a general coordinator', async () => {
      const { token } = await caller('superadmin');
      const user = await target('general_coordinator');
      expect((await resetPassword(token, user.id)).status).toBe(204);
    });

    it('does not let a coordinator reset their own password this way', async () => {
      const { user, token } = await caller('general_coordinator');
      expectError(await resetPassword(token, user.id), 403, 'FORBIDDEN', OUTRANKED);
    });
  });

  it('answers 404 for an unknown user', async () => {
    const { token } = await caller('general_coordinator');
    expectError(
      await resetPassword(token, new Types.ObjectId().toHexString()),
      404,
      'NOT_FOUND',
      'No encontramos ese usuario.',
    );
  });

  it('rejects an id that is not an ObjectId', async () => {
    const { token } = await caller('general_coordinator');
    const res = await resetPassword(token, 'not-an-id');
    expectError(res, 400, 'VALIDATION_ERROR');
    expect(apiErrorBodySchema.parse(res.body).error.fields).toEqual({
      'params.id': ['Identificador no válido.'],
    });
  });

  it('requires a session', async () => {
    const user = await target('team_leader');
    expectError(await resetPassword(null, user.id), 401, 'UNAUTHENTICATED');
  });

  it('refuses a cross-origin request', async () => {
    const { token } = await caller('general_coordinator');
    const user = await target('team_leader');
    const res = await request(app)
      .post(`/api/users/${user.id}/reset-password`)
      .set({ ...sameOriginHeaders, Origin: 'https://evil.example' })
      .set('Cookie', sessionCookie(token));
    expectError(res, 403, 'FORBIDDEN');
    await expect(AuditLogModel.countDocuments()).resolves.toBe(0);
  });
});

describe('POST /api/users/:id/unlock', () => {
  function unlock(token: string | null, userId: string) {
    const req = request(app).post(`/api/users/${userId}/unlock`).set(sameOriginHeaders);
    return token ? req.set('Cookie', sessionCookie(token)) : req;
  }

  async function lockedTarget(role: Role, recintoKey = OTHER_RECINTO) {
    const user = await target(role, { recintoKey });
    await UserModel.updateOne(
      { _id: user._id },
      { failedAttempts: 10, lockUntil: new Date(Date.now() + 60 * 60 * 1000) },
    );
    return user;
  }

  it('clears the lockout without touching the password', async () => {
    const { token } = await caller('general_coordinator');
    const user = await lockedTarget('aspiring_leader');

    expect((await login(app, user.username, FORGOTTEN_PASSWORD)).status).toBe(401);
    expect((await unlock(token, user.id)).status).toBe(204);

    const stored = await UserModel.findById(user._id).lean();
    expect(stored).toMatchObject({ failedAttempts: 0, lockUntil: null });
    expect((await login(app, user.username, FORGOTTEN_PASSWORD)).status).toBe(204);
    expect(stored?.passwordHash).toBe(user.passwordHash);
  });

  it('records the unlock in the audit log, with the cédula masked', async () => {
    const { user: coordinator, token } = await caller('general_coordinator');
    const user = await lockedTarget('team_leader');

    await unlock(token, user.id);

    const entries = await AuditLogModel.find().lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: coordinator._id,
      action: 'user.unlocked',
      entity: 'user',
      entityId: user._id,
    });
    const masked = `${user.username.slice(0, 3)}-*******-${user.username.slice(-1)}`;
    expect(entries[0]?.summary).toBe(`Desbloqueó la cuenta de ${masked}.`);
  });

  describe('scope', () => {
    it('lets a recinto coordinator unlock a leader who votes in one of their recintos', async () => {
      const { token } = await caller('recinto_coordinator', [RECINTO]);
      const user = await lockedTarget('team_leader', RECINTO);
      expect((await unlock(token, user.id)).status).toBe(204);
    });

    it('refuses a recinto coordinator a leader out of their scope', async () => {
      const { token } = await caller('recinto_coordinator', [RECINTO]);
      const user = await lockedTarget('team_leader', OTHER_RECINTO);
      expectError(await unlock(token, user.id), 403, 'FORBIDDEN', NOT_IN_SCOPE);
      const stored = await UserModel.findById(user._id).lean();
      expect(stored?.lockUntil).not.toBeNull();
    });
  });

  describe('rank', () => {
    it('never lets a general coordinator unlock the superadmin', async () => {
      const { token } = await caller('general_coordinator');
      const superadmin = await createTestUser({ role: 'superadmin' });
      await UserModel.updateOne(
        { _id: superadmin._id },
        { failedAttempts: 10, lockUntil: new Date(Date.now() + 60 * 60 * 1000) },
      );
      expectError(
        await unlock(token, superadmin.id),
        403,
        'FORBIDDEN',
        'No puede desbloquear a este usuario.',
      );
    });
  });

  it('answers 404 for an unknown user', async () => {
    const { token } = await caller('general_coordinator');
    expectError(
      await unlock(token, new Types.ObjectId().toHexString()),
      404,
      'NOT_FOUND',
      'No encontramos ese usuario.',
    );
  });

  it('requires a session', async () => {
    const user = await lockedTarget('team_leader');
    expectError(await unlock(null, user.id), 401, 'UNAUTHENTICATED');
  });
});

describe('PATCH /api/users/:id', () => {
  function patch(token: string | null, userId: string, body: object) {
    const req = request(app).patch(`/api/users/${userId}`).set(sameOriginHeaders).send(body);
    return token ? req.set('Cookie', sessionCookie(token)) : req;
  }

  it('deactivates and reactivates a user', async () => {
    const { token } = await caller('superadmin');
    const user = await target('team_leader');

    expect((await patch(token, user.id, { isActive: false })).status).toBe(204);
    await expect(UserModel.findById(user._id).lean()).resolves.toMatchObject({ isActive: false });

    expect((await patch(token, user.id, { isActive: true })).status).toBe(204);
    await expect(UserModel.findById(user._id).lean()).resolves.toMatchObject({ isActive: true });
  });

  it("sets a recinto coordinator's recintoScopes to recintos that exist", async () => {
    const { token } = await caller('superadmin');
    const user = await target('recinto_coordinator');
    await RecintoModel.create({
      _id: RECINTO,
      name: 'LICEO JUAN PABLO DUARTE',
      sector: 'CENTRO CIUDAD',
      colegios: [1],
      voterCount: 1,
    });

    expect((await patch(token, user.id, { recintoScopes: [RECINTO] })).status).toBe(204);
    await expect(UserModel.findById(user._id).lean()).resolves.toMatchObject({
      recintoScopes: [RECINTO],
    });
  });

  it('rejects recintoScopes for a role that is not a recinto coordinator', async () => {
    const { token } = await caller('superadmin');
    const user = await target('team_leader');
    const res = await patch(token, user.id, { recintoScopes: [] });
    expectError(res, 400, 'VALIDATION_ERROR');
  });

  it('rejects a recinto that does not exist', async () => {
    const { token } = await caller('superadmin');
    const user = await target('recinto_coordinator');
    const res = await patch(token, user.id, { recintoScopes: ['no-existe--sector'] });
    expectError(res, 400, 'VALIDATION_ERROR');
    expect(apiErrorBodySchema.parse(res.body).error.fields).toEqual({
      'body.recintoScopes': ['Hay un recinto que no existe.'],
    });
  });

  it('rejects an empty body', async () => {
    const { token } = await caller('superadmin');
    const user = await target('team_leader');
    expectError(await patch(token, user.id, {}), 400, 'VALIDATION_ERROR');
  });

  it('records the change in the audit log, with the cédula masked', async () => {
    const { user: admin, token } = await caller('superadmin');
    const user = await target('team_leader');

    await patch(token, user.id, { isActive: false });

    const entries = await AuditLogModel.find().lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: admin._id,
      action: 'user.updated',
      entity: 'user',
      entityId: user._id,
    });
    const masked = `${user.username.slice(0, 3)}-*******-${user.username.slice(-1)}`;
    expect(entries[0]?.summary).toBe(`Desactivó la cuenta de ${masked}.`);
  });

  describe('rank', () => {
    it('never lets a general coordinator modify the superadmin', async () => {
      const { token } = await caller('general_coordinator');
      const superadmin = await createTestUser({ role: 'superadmin' });
      expectError(
        await patch(token, superadmin.id, { isActive: false }),
        403,
        'FORBIDDEN',
        'No puede modificar este usuario.',
      );
      await expect(UserModel.findById(superadmin._id).lean()).resolves.toMatchObject({
        isActive: true,
      });
    });
  });

  describe('role', () => {
    it("lets the superadmin move a team leader straight to general coordinator, syncing the person's level", async () => {
      const { token } = await caller('superadmin');
      const user = await target('team_leader');

      expect((await patch(token, user.id, { role: 'general_coordinator' })).status).toBe(204);

      await expect(UserModel.findById(user._id).lean()).resolves.toMatchObject({
        role: 'general_coordinator',
      });
      await expect(PersonModel.findById(user.personId).lean()).resolves.toMatchObject({
        level: 'coordinator',
      });
    });

    it('requires recintoScopes to move someone to recinto coordinator', async () => {
      const { token } = await caller('superadmin');
      const user = await target('aspiring_leader');

      const res = await patch(token, user.id, { role: 'recinto_coordinator' });

      expectError(res, 400, 'VALIDATION_ERROR');
      expect(apiErrorBodySchema.parse(res.body).error.fields).toEqual({
        'body.recintoScopes': ['Indique al menos un recinto para un coordinador de recinto.'],
      });
    });

    it('moves someone to recinto coordinator given recintoScopes', async () => {
      const { token } = await caller('superadmin');
      const user = await target('aspiring_leader');
      await RecintoModel.create({
        _id: RECINTO,
        name: 'LICEO JUAN PABLO DUARTE',
        sector: 'CENTRO CIUDAD',
        colegios: [1],
        voterCount: 1,
      });

      const res = await patch(token, user.id, {
        role: 'recinto_coordinator',
        recintoScopes: [RECINTO],
      });

      expect(res.status).toBe(204);
      await expect(UserModel.findById(user._id).lean()).resolves.toMatchObject({
        role: 'recinto_coordinator',
        recintoScopes: [RECINTO],
      });
    });

    it('clears recintoScopes when moving a recinto coordinator to general coordinator', async () => {
      const { token } = await caller('superadmin');
      const user = await target('recinto_coordinator', { recintoKey: RECINTO });
      await UserModel.updateOne({ _id: user._id }, { recintoScopes: [RECINTO] });

      expect((await patch(token, user.id, { role: 'general_coordinator' })).status).toBe(204);

      await expect(UserModel.findById(user._id).lean()).resolves.toMatchObject({
        role: 'general_coordinator',
        recintoScopes: [],
      });
    });

    it('refuses a general coordinator changing anyone’s role, even one they outrank', async () => {
      const { token } = await caller('general_coordinator');
      const user = await target('team_leader');

      expectError(
        await patch(token, user.id, { role: 'recinto_coordinator', recintoScopes: [RECINTO] }),
        403,
        'FORBIDDEN',
        'Solo el superadministrador puede cambiar el rol de un usuario.',
      );
      await expect(UserModel.findById(user._id).lean()).resolves.toMatchObject({
        role: 'team_leader',
      });
    });

    it('records the role change in the audit log', async () => {
      const { user: admin, token } = await caller('superadmin');
      const user = await target('team_leader');

      await patch(token, user.id, { role: 'general_coordinator' });

      const entries = await AuditLogModel.find().lean();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        actorUserId: admin._id,
        action: 'user.updated',
        entity: 'user',
        entityId: user._id,
      });
      const masked = `${user.username.slice(0, 3)}-*******-${user.username.slice(-1)}`;
      expect(entries[0]?.summary).toBe(
        `Cambió el rol de ${masked} de líder de equipo a coordinador(a) general.`,
      );
    });
  });

  it('answers 404 for an unknown user', async () => {
    const { token } = await caller('superadmin');
    expectError(
      await patch(token, new Types.ObjectId().toHexString(), { isActive: false }),
      404,
      'NOT_FOUND',
    );
  });

  it('requires users.manage: a recinto coordinator cannot activate/deactivate', async () => {
    const { token } = await caller('recinto_coordinator', [RECINTO]);
    const user = await target('team_leader');
    expectError(await patch(token, user.id, { isActive: false }), 403, 'FORBIDDEN');
  });

  it('requires a session', async () => {
    const user = await target('team_leader');
    expectError(await patch(null, user.id, { isActive: false }), 401, 'UNAUTHENTICATED');
  });
});

describe('GET /api/users', () => {
  function list(token: string, query = '') {
    return request(app).get(`/api/users${query}`).set('Cookie', sessionCookie(token));
  }

  it('lists users, joined with their person for display', async () => {
    const { token } = await caller('superadmin');
    const user = await target('team_leader');

    const res = await list(token);

    expect(res.status).toBe(200);
    const { items } = userListResponseSchema.parse(res.body);
    const row = items.find((item) => item.id === user.id);
    expect(row).toMatchObject({
      username: user.username,
      role: 'team_leader',
      isActive: true,
      usingDefaultPassword: false,
      locked: false,
      person: { fullName: 'MARÍA RODRÍGUEZ' },
    });
  });

  it('filters by role', async () => {
    const { token } = await caller('superadmin');
    await target('team_leader');
    await target('recinto_coordinator');

    const { items } = userListResponseSchema.parse(
      (await list(token, '?role=recinto_coordinator')).body,
    );
    expect(items.every((item) => item.role === 'recinto_coordinator')).toBe(true);
  });

  it('filters by active state', async () => {
    const { token } = await caller('superadmin');
    const inactive = await target('team_leader');
    await UserModel.updateOne({ _id: inactive._id }, { isActive: false });

    const { items } = userListResponseSchema.parse((await list(token, '?isActive=false')).body);
    expect(items.map((item) => item.id)).toContain(inactive.id);
    expect(items.every((item) => !item.isActive)).toBe(true);
  });

  it('filters by whether the password is still the default', async () => {
    const { token } = await caller('superadmin');
    const usingDefault = await target('team_leader');
    await UserModel.updateOne({ _id: usingDefault._id }, { usingDefaultPassword: true });

    const { items } = userListResponseSchema.parse(
      (await list(token, '?usingDefaultPassword=true')).body,
    );
    expect(items.map((item) => item.id)).toContain(usingDefault.id);
    expect(items.every((item) => item.usingDefaultPassword)).toBe(true);
  });

  it('requires users.manage: a recinto coordinator cannot list users', async () => {
    const { token } = await caller('recinto_coordinator', [RECINTO]);
    expectError(await list(token), 403, 'FORBIDDEN');
  });
});

describe('POST /api/users', () => {
  let records: RawVoterRecord[];

  beforeEach(async () => {
    records = await importFakePadron(50);
  });

  async function voterAt(index: number): Promise<Voter> {
    const voter = await VoterModel.findById(records[index]?.cedula).lean();
    if (!voter) throw new Error(`No voter at ${index}`);
    return voter;
  }

  function appoint(token: string | null, body: Partial<AppointUserRequest>) {
    const req = request(app).post('/api/users').set(sameOriginHeaders).send(body);
    return token ? req.set('Cookie', sessionCookie(token)) : req;
  }

  function requestFor(cedula: string, overrides: Partial<AppointUserRequest> = {}) {
    return {
      cedula,
      role: 'recinto_coordinator' as const,
      recintoScopes: [] as string[],
      phone: '8095551234',
      phoneWhatsapp: true,
      ...overrides,
    };
  }

  it('appoints a recinto coordinator who can then log in with the birth date', async () => {
    const { token } = await caller('superadmin');
    const voter = await voterAt(0);

    const res = await appoint(token, requestFor(voter._id, { recintoScopes: [voter.recintoKey] }));

    expect(res.status).toBe(201);
    expect((res.body as { id: string }).id).toEqual(expect.any(String));
    const created = await UserModel.findOne({ username: voter._id }).lean();
    expect(created).toMatchObject({ role: 'recinto_coordinator', usingDefaultPassword: true });
  });

  it('answers 404 for a cédula not in the padrón', async () => {
    const { token } = await caller('superadmin');
    const res = await appoint(
      token,
      requestFor('99999999999', { role: 'general_coordinator', recintoScopes: [] }),
    );
    expectError(res, 404, 'NOT_FOUND', 'Esta cédula no figura en el padrón de Higüey.');
  });

  it('validates the body', async () => {
    const { token } = await caller('superadmin');
    const res = await appoint(token, {});
    expectError(res, 400, 'VALIDATION_ERROR');
  });

  it('requires a recinto for a recinto coordinator', async () => {
    const { token } = await caller('superadmin');
    const voter = await voterAt(1);
    const res = await appoint(
      token,
      requestFor(voter._id, { role: 'recinto_coordinator', recintoScopes: [] }),
    );
    expectError(res, 400, 'VALIDATION_ERROR');
  });

  it('never lets a general coordinator appoint another general coordinator', async () => {
    const { token } = await caller('general_coordinator');
    const voter = await voterAt(2);
    const res = await appoint(
      token,
      requestFor(voter._id, { role: 'general_coordinator', recintoScopes: [] }),
    );
    expectError(res, 403, 'FORBIDDEN', 'No puede nombrar este rol.');
  });

  it('requires users.manage: a recinto coordinator cannot appoint anyone', async () => {
    const { token } = await caller('recinto_coordinator', [RECINTO]);
    const voter = await voterAt(3);
    const res = await appoint(
      token,
      requestFor(voter._id, { role: 'recinto_coordinator', recintoScopes: [voter.recintoKey] }),
    );
    expectError(res, 403, 'FORBIDDEN');
  });

  it('requires a session', async () => {
    const voter = await voterAt(4);
    expectError(
      await appoint(null, requestFor(voter._id, { recintoScopes: [voter.recintoKey] })),
      401,
      'UNAUTHENTICATED',
    );
  });
});
