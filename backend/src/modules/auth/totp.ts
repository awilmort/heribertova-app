import type { Types } from 'mongoose';
import { decryptSecret } from '../../lib/secretBox';
import { hashToken, newSecretToken } from '../../lib/token';
import { matchTotpStep } from '../../lib/totp';
import { UserModel, type UserDocument } from '../users/model';
import { TotpChallengeModel } from './model';
import { isLocked, registerFailedAttempt } from './service';

/**
 * The superadmin's second login step (HERIBERTO_ARCHITECTURE.md §7, plan 3.3). A right password
 * opens a short TOTP challenge instead of a session; only a valid, unused code turns it into one.
 *
 * Guessing is bounded three ways: each challenge takes at most TOTP_CHALLENGE_MAX_ATTEMPTS codes
 * (claimed atomically, so parallel requests cannot exceed it), every wrong code counts toward the
 * account's progressive lockout like a wrong password, and the route limits failures per IP.
 */

/** How long the superadmin has to type the code after the password. */
export const TOTP_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Codes one challenge accepts before the password step must be repeated. */
export const TOTP_CHALLENGE_MAX_ATTEMPTS = 5;

/** Only the superadmin logs in with a second factor (§7). */
export function requiresTotp(user: UserDocument): boolean {
  return user.role === 'superadmin';
}

export interface NewTotpChallenge {
  /** The secret for the `__Host-totp` cookie. Never stored or logged. */
  token: string;
  maxAgeMs: number;
}

/**
 * Opens the TOTP challenge of a user whose password was right, replacing any open one: a user has
 * at most one, so repeating the password step never multiplies the codes an attacker may try.
 */
export async function startTotpChallenge(user: UserDocument): Promise<NewTotpChallenge> {
  const token = newSecretToken();
  await TotpChallengeModel.replaceOne(
    { userId: user._id },
    {
      userId: user._id,
      tokenHash: hashToken(token),
      attempts: 0,
      expiresAt: new Date(Date.now() + TOTP_CHALLENGE_TTL_MS),
    },
    { upsert: true },
  );
  return { token, maxAgeMs: TOTP_CHALLENGE_TTL_MS };
}

/**
 * Why a TOTP step failed, for the logs. `no_challenge` (unknown, expired or out of attempts),
 * `inactive` and `locked` mean the login must start over; a wrong or reused code may be retried.
 */
export type TotpFailureReason =
  'no_challenge' | 'inactive' | 'locked' | 'wrong_code' | 'reused_code';

export type TotpVerification =
  { ok: true; user: UserDocument } | { ok: false; reason: TotpFailureReason };

/**
 * Accepts TOTP time step `step` for the user unless it (or a later one) was already used, atomically,
 * so two requests carrying the same code cannot both succeed.
 */
async function claimTotpStep(userId: Types.ObjectId, step: number): Promise<boolean> {
  const { modifiedCount } = await UserModel.updateOne(
    { _id: userId, $or: [{ totpLastUsedStep: null }, { totpLastUsedStep: { $lt: step } }] },
    { totpLastUsedStep: step },
  );
  return modifiedCount === 1;
}

/**
 * Checks `code` against the challenge behind `token`. On success the challenge is consumed and the
 * caller completes the login. `key` is TOTP_ENC_KEY, which decrypts the user's secret.
 */
export async function verifyTotpChallenge(
  token: string,
  code: string,
  key: Buffer,
): Promise<TotpVerification> {
  const now = new Date();
  // Claim an attempt before checking anything, so the cap holds under concurrent requests.
  const challenge = await TotpChallengeModel.findOneAndUpdate(
    {
      tokenHash: hashToken(token),
      expiresAt: { $gt: now },
      attempts: { $lt: TOTP_CHALLENGE_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
  );
  if (!challenge) return { ok: false, reason: 'no_challenge' };

  const user = await UserModel.findById(challenge.userId);
  if (!user?.isActive || !user.totpSecretEnc) {
    await challenge.deleteOne();
    return { ok: false, reason: 'inactive' };
  }
  if (isLocked(user, now)) return { ok: false, reason: 'locked' };

  const step = matchTotpStep(decryptSecret(key, user.totpSecretEnc), code, now.getTime());
  if (step === null || !(await claimTotpStep(user._id, step))) {
    await registerFailedAttempt(user, now);
    return { ok: false, reason: step === null ? 'wrong_code' : 'reused_code' };
  }
  await challenge.deleteOne();
  return { ok: true, user };
}
