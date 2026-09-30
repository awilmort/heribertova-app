import {
  minPasswordLength,
  outranks,
  PASSWORD_MAX_LENGTH,
  PASSWORD_TOO_LONG_MESSAGE,
  passwordTooShortMessage,
  type ChangePasswordRequest,
  type Role,
  type UpdateUserRequest,
} from '@heribertova/shared';
import mongoose, { type ClientSession } from 'mongoose';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { audit, type Actor } from '../audit/service';
import { PersonModel, type Person } from '../people/model';
import { assertInScope } from '../people/scope';
import { assertKnownRecintos } from '../recintos/validate';
import { revokeUserSessions } from '../sessions/service';
import { defaultPassword, isBirthDatePassword } from './defaultPassword';
import { UserModel, type User, type UserDocument } from './model';

/** What a login needs from its person: the cédula (username) and the voter's birth date. */
export type LoginPerson = Pick<Person, '_id' | 'cedula'> & {
  voterSnapshot: Pick<Person['voterSnapshot'], 'birthDate'>;
};

function defaultPasswordHash(person: LoginPerson): Promise<string> {
  return hashPassword(defaultPassword(person.voterSnapshot.birthDate));
}

export interface CreateLoginOptions {
  /** recintoKeys for a recinto_coordinator (plan 4.3's appointment); empty for every other role. */
  recintoScopes?: string[];
  /** Runs the insert in the caller's transaction, so it commits or rolls back with it. */
  session?: ClientSession;
}

/**
 * Creates the login of a person who becomes an aspirant, a leader or a coordinator (nomination,
 * plan 6.1; appointment, plan 4.3). The username is the cédula and the password the default one,
 * the birth date as DDMMYYYY, until the user changes it. The superadmin is never created this way:
 * it gets a strong password and TOTP from its CLI (plan 3.3).
 */
export async function createLoginForPerson(
  person: LoginPerson,
  role: Exclude<Role, 'superadmin'>,
  { recintoScopes = [], session }: CreateLoginOptions = {},
): Promise<UserDocument> {
  if ((role as Role) === 'superadmin') {
    throw new Error('The superadmin never gets a birth-date password');
  }
  const [user] = await UserModel.create(
    [
      {
        personId: person._id,
        username: person.cedula,
        passwordHash: await defaultPasswordHash(person),
        role,
        recintoScopes,
        usingDefaultPassword: true,
      },
    ],
    { session },
  );
  if (!user) throw new Error('UserModel.create returned no document');
  return user;
}

async function personOf(user: UserDocument): Promise<Person> {
  const person = await PersonModel.findById(user.personId).lean();
  if (!person) throw new Error(`User ${user.id} has no person document`);
  return person;
}

/**
 * "Restablecer a fecha de nacimiento" and reactivation both need to act on another account: the
 * caller must have it in scope and outrank it, so nobody touches a peer, a superior or the
 * superadmin (plan 3.2, 4.3).
 */
async function assertMayActOn(
  actor: Actor,
  user: UserDocument,
  forbiddenMessage: string,
): Promise<Person> {
  const person = await personOf(user);
  assertInScope(actor.user, person);
  if (!outranks(actor.user.role, user.role)) {
    throw new AppError(403, 'FORBIDDEN', forbiddenMessage);
  }
  return person;
}

/** Loads the user `userId` acts on, 404 if it does not exist. */
async function loadUser(userId: string): Promise<UserDocument> {
  const user = await UserModel.findById(userId);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'No encontramos ese usuario.');
  return user;
}

/**
 * "Restablecer a fecha de nacimiento" (HERIBERTO_ARCHITECTURE.md §7): a coordinator puts a user who
 * forgot their password back on the default one. It also unlocks the account and ends all of its
 * sessions. The caller must have the user in scope and outrank them, so nobody resets a peer, a
 * superior or the superadmin (whose password is never a birth date).
 */
export async function resetPasswordToDefault(actor: Actor, userId: string): Promise<void> {
  const user = await loadUser(userId);
  const person = await assertMayActOn(
    actor,
    user,
    'No puede restablecer la contraseña de este usuario.',
  );

  // Hashing is slow on purpose: do it before the transaction, which may be retried.
  const passwordHash = await defaultPasswordHash(person);
  await mongoose.connection.transaction(async (session) => {
    await UserModel.updateOne(
      { _id: user._id },
      { passwordHash, usingDefaultPassword: true, failedAttempts: 0, lockUntil: null },
      { session },
    );
    await revokeUserSessions(user._id, { session });
    await audit(
      actor,
      {
        action: 'user.password_reset',
        entity: 'user',
        entityId: user._id,
        summary: `Restableció a la fecha de nacimiento la contraseña de ${user.username}.`,
      },
      session,
    );
  });
}

function invalidField(field: keyof ChangePasswordRequest, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
    [`body.${field}`]: [message],
  });
}

/**
 * Why `password` cannot be chosen by a `role` user born on `birthDate` ("YYYY-MM-DD"), in Spanish;
 * null when it can. It must be long enough for the role (14 characters for the superadmin) and
 * not the birth date, which is as guessable as the default password (§7).
 */
export function newPasswordProblem(password: string, role: Role, birthDate: string): string | null {
  const minLength = minPasswordLength(role);
  if (password.length < minLength) return passwordTooShortMessage(minLength);
  if (password.length > PASSWORD_MAX_LENGTH) return PASSWORD_TOO_LONG_MESSAGE;
  if (isBirthDatePassword(password, birthDate)) {
    return 'La nueva contraseña no puede ser su fecha de nacimiento.';
  }
  return null;
}

/**
 * A user replaces their own password (`/perfil`). It needs the current password, and the new one
 * must pass `newPasswordProblem`. Every other session of the user ends; the one making the change
 * (`currentToken`) stays.
 */
export async function changeOwnPassword(
  actor: Actor,
  { currentPassword, newPassword }: ChangePasswordRequest,
  currentToken: string,
): Promise<void> {
  const { user } = actor;
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw invalidField('currentPassword', 'La contraseña actual no es correcta.');
  }
  const person = await personOf(user);
  const problem = newPasswordProblem(newPassword, user.role, person.voterSnapshot.birthDate);
  if (problem) throw invalidField('newPassword', problem);

  const passwordHash = await hashPassword(newPassword);
  await mongoose.connection.transaction(async (session) => {
    await UserModel.updateOne(
      { _id: user._id },
      { passwordHash, usingDefaultPassword: false },
      { session },
    );
    await revokeUserSessions(user._id, { keepToken: currentToken, session });
    await audit(
      actor,
      {
        action: 'user.password_changed',
        entity: 'user',
        entityId: user._id,
        summary: 'Cambió su contraseña.',
      },
      session,
    );
  });
}

/**
 * "Desbloquear" (plan 4.3): clears a progressive lockout without touching the password. Unlike a
 * password reset, this does not revoke sessions: a lockout only blocks new logins, so any session
 * the user already had is unaffected. Same rank and scope rules as `resetPasswordToDefault`.
 */
export async function unlockUser(actor: Actor, userId: string): Promise<void> {
  const user = await loadUser(userId);
  await assertMayActOn(actor, user, 'No puede desbloquear a este usuario.');

  await mongoose.connection.transaction(async (session) => {
    await UserModel.updateOne(
      { _id: user._id },
      { failedAttempts: 0, lockUntil: null },
      { session },
    );
    await audit(
      actor,
      {
        action: 'user.unlocked',
        entity: 'user',
        entityId: user._id,
        summary: `Desbloqueó la cuenta de ${user.username}.`,
      },
      session,
    );
  });
}

/**
 * `PATCH /api/users/:id` (plan 4.3): activates/deactivates a user and/or sets a recinto
 * coordinator's `recintoScopes`. Restricted to `users.manage` (superadmin, general coordinator),
 * both of whom see every user, so unlike `unlockUser` this only needs the rank check, not scope.
 */
export async function updateUser(
  actor: Actor,
  userId: string,
  patch: UpdateUserRequest,
): Promise<void> {
  const user = await loadUser(userId);
  if (!outranks(actor.user.role, user.role)) {
    throw new AppError(403, 'FORBIDDEN', 'No puede modificar este usuario.');
  }
  if (patch.recintoScopes !== undefined && user.role !== 'recinto_coordinator') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
      'body.recintoScopes': ['Solo un coordinador de recinto tiene recintos asignados.'],
    });
  }
  if (patch.recintoScopes !== undefined) {
    await assertKnownRecintos(patch.recintoScopes, 'body.recintoScopes');
  }

  const changes: Partial<Pick<User, 'isActive' | 'recintoScopes'>> = {};
  const summaryParts: string[] = [];
  if (patch.isActive !== undefined) {
    changes.isActive = patch.isActive;
    summaryParts.push(
      patch.isActive
        ? `Activó la cuenta de ${user.username}.`
        : `Desactivó la cuenta de ${user.username}.`,
    );
  }
  if (patch.recintoScopes !== undefined) {
    changes.recintoScopes = patch.recintoScopes;
    summaryParts.push(`Actualizó los recintos asignados a ${user.username}.`);
  }

  await mongoose.connection.transaction(async (session) => {
    await UserModel.updateOne({ _id: user._id }, changes, { session });
    await audit(
      actor,
      {
        action: 'user.updated',
        entity: 'user',
        entityId: user._id,
        summary: summaryParts.join(' '),
      },
      session,
    );
  });
}
