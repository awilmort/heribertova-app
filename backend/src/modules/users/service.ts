import {
  minPasswordLength,
  outranks,
  passwordTooShortMessage,
  type ChangePasswordRequest,
  type Role,
} from '@heribertova/shared';
import mongoose from 'mongoose';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { audit, type Actor } from '../audit/service';
import { PersonModel, type Person } from '../people/model';
import { assertInScope } from '../people/scope';
import { revokeUserSessions } from '../sessions/service';
import { defaultPassword, isBirthDatePassword } from './defaultPassword';
import { UserModel, type UserDocument } from './model';

/** What a login needs from its person: the cédula (username) and the voter's birth date. */
export type LoginPerson = Pick<Person, '_id' | 'cedula'> & {
  voterSnapshot: Pick<Person['voterSnapshot'], 'birthDate'>;
};

function defaultPasswordHash(person: LoginPerson): Promise<string> {
  return hashPassword(defaultPassword(person.voterSnapshot.birthDate));
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
): Promise<UserDocument> {
  if ((role as Role) === 'superadmin') {
    throw new Error('The superadmin never gets a birth-date password');
  }
  return UserModel.create({
    personId: person._id,
    username: person.cedula,
    passwordHash: await defaultPasswordHash(person),
    role,
    usingDefaultPassword: true,
  });
}

async function personOf(user: UserDocument): Promise<Person> {
  const person = await PersonModel.findById(user.personId).lean();
  if (!person) throw new Error(`User ${user.id} has no person document`);
  return person;
}

/**
 * "Restablecer a fecha de nacimiento" (HERIBERTO_ARCHITECTURE.md §7): a coordinator puts a user who
 * forgot their password back on the default one. It also unlocks the account and ends all of its
 * sessions. The caller must have the user in scope and outrank them, so nobody resets a peer, a
 * superior or the superadmin (whose password is never a birth date).
 */
export async function resetPasswordToDefault(actor: Actor, userId: string): Promise<void> {
  const user = await UserModel.findById(userId);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'No encontramos ese usuario.');
  const person = await personOf(user);
  assertInScope(actor.user, person);
  if (!outranks(actor.user.role, user.role)) {
    throw new AppError(403, 'FORBIDDEN', 'No puede restablecer la contraseña de este usuario.');
  }

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
 * A user replaces their own password (`/perfil`). It needs the current password, and the new one
 * may not be the birth date (the guessable default) nor, for the superadmin, shorter than 14
 * characters. Every other session of the user ends; the one making the change (`currentToken`) stays.
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
  const minLength = minPasswordLength(user.role);
  if (newPassword.length < minLength) {
    throw invalidField('newPassword', passwordTooShortMessage(minLength));
  }
  const person = await personOf(user);
  if (isBirthDatePassword(newPassword, person.voterSnapshot.birthDate)) {
    throw invalidField('newPassword', 'La nueva contraseña no puede ser su fecha de nacimiento.');
  }

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
