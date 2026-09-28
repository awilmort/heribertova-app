import { hashPassword, verifyPassword } from '../../lib/password';
import { newSecretToken } from '../../lib/token';
import { UserModel, type UserDocument } from '../users/model';
import { lockoutDurationMs } from './lockout';

/** Why a login failed: for the logs only. The client always gets the same generic answer. */
export type LoginFailureReason = 'unknown_user' | 'inactive' | 'locked' | 'wrong_password';

export type AuthenticationResult =
  { ok: true; user: UserDocument } | { ok: false; reason: LoginFailureReason };

let dummyHash: Promise<string> | undefined;

/**
 * A hash nobody knows the password of. Checking against it when there is no password to check
 * keeps every failed login equally slow, so response times do not reveal which cédulas have accounts.
 */
function hashForTimingOnly(): Promise<string> {
  dummyHash ??= hashPassword(newSecretToken());
  return dummyHash;
}

/** Fails without checking the account's password, taking as long as a real check would. */
async function refuse(reason: LoginFailureReason, password: string): Promise<AuthenticationResult> {
  await verifyPassword(await hashForTimingOnly(), password);
  return { ok: false, reason };
}

/** True while a lockout refuses the account's logins. */
export function isLocked(user: UserDocument, now: Date): boolean {
  return user.lockUntil !== null && user.lockUntil > now;
}

/**
 * Counts a failed login step (a wrong password, or a wrong TOTP code) toward the account's
 * progressive lockout, and locks the account when the count reaches a threshold.
 */
export async function registerFailedAttempt(user: UserDocument, now: Date): Promise<void> {
  const updated = await UserModel.findByIdAndUpdate(
    user._id,
    { $inc: { failedAttempts: 1 } },
    { returnDocument: 'after' },
  );
  const lockMs = updated && lockoutDurationMs(updated.failedAttempts);
  if (lockMs) {
    await UserModel.updateOne({ _id: user._id }, { lockUntil: new Date(now.getTime() + lockMs) });
  }
}

/**
 * Checks a cédula + password (the first login step). Inactive and locked accounts are refused
 * without checking the password, and attempts during a lockout do not extend it. Every failure of
 * an existing, active account counts toward the progressive lockout. A success changes nothing
 * yet: the login is complete only after `completeLogin` (for the superadmin, after the TOTP step,
 * so a known password alone never resets the failures a wrong code has counted).
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<AuthenticationResult> {
  const now = new Date();
  const user = await UserModel.findOne({ username });

  if (!user) return refuse('unknown_user', password);
  if (!user.isActive) return refuse('inactive', password);
  if (isLocked(user, now)) return refuse('locked', password);

  if (!(await verifyPassword(user.passwordHash, password))) {
    await registerFailedAttempt(user, now);
    return { ok: false, reason: 'wrong_password' };
  }
  return { ok: true, user };
}

/** Records a completed login: the lockout count starts over and the login time is kept. */
export async function completeLogin(user: UserDocument): Promise<void> {
  await UserModel.updateOne(
    { _id: user._id },
    { failedAttempts: 0, lockUntil: null, lastLoginAt: new Date() },
  );
}
