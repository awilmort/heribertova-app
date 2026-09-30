import type { Role } from '@heribertova/shared';
import type { ClientSession, Types } from 'mongoose';
import { hashToken, newSecretToken } from '../../lib/token';
import { UserModel, type UserDocument } from '../users/model';
import { SessionModel } from './model';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface SessionLifetime {
  /** The session ends after this long without a request. */
  idleMs: number;
  /** The session ends this long after login, however active it is. */
  absoluteMs: number;
}

/** Field users on shared phones stay logged in for a week of inactivity, a month at most (§7). */
const DEFAULT_LIFETIME: SessionLifetime = { idleMs: 7 * DAY_MS, absoluteMs: 30 * DAY_MS };
/** The superadmin can do everything (including voter imports), so its sessions are short. */
const SUPERADMIN_LIFETIME: SessionLifetime = { idleMs: 12 * HOUR_MS, absoluteMs: 12 * HOUR_MS };

/**
 * `lastSeenAt` (and with it the idle deadline) is written at most this often, so an active user
 * costs one session write per minute instead of one per request (Atlas M0 has a throughput cap).
 */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

export function sessionLifetime(role: Role): SessionLifetime {
  return role === 'superadmin' ? SUPERADMIN_LIFETIME : DEFAULT_LIFETIME;
}

/** When a session seen at `lastSeenAt` expires: the earlier of its idle and absolute deadlines. */
export function sessionExpiry(createdAt: Date, lastSeenAt: Date, role: Role): Date {
  const { idleMs, absoluteMs } = sessionLifetime(role);
  return new Date(Math.min(lastSeenAt.getTime() + idleMs, createdAt.getTime() + absoluteMs));
}

export interface NewSession {
  /** The secret for the cookie (256 random bits, base64url). Never stored or logged. */
  token: string;
  /** How long the cookie should live: the session's absolute lifetime. */
  maxAgeMs: number;
}

export interface SessionClient {
  ip: string | null;
  userAgent: string | null;
}

const MAX_USER_AGENT_LENGTH = 512;

/** Opens a session for `user` (a fresh token on every login). */
export async function createSession(
  user: UserDocument,
  client: SessionClient,
): Promise<NewSession> {
  const token = newSecretToken();
  const now = new Date();
  await SessionModel.create({
    tokenHash: hashToken(token),
    userId: user._id,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: sessionExpiry(now, now, user.role),
    ip: client.ip,
    ua: client.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
  });
  return { token, maxAgeMs: sessionLifetime(user.role).absoluteMs };
}

/**
 * The active user behind a session token, or null when the session is unknown, expired, or its
 * user no longer exists or was deactivated. A valid session slides its idle deadline forward.
 *
 * Expiry is checked here and not left to the TTL index: MongoDB deletes expired documents only
 * about once a minute.
 */
export async function resolveSession(token: string): Promise<UserDocument | null> {
  const now = new Date();
  const session = await SessionModel.findOne({ tokenHash: hashToken(token) });
  if (!session || session.expiresAt <= now) return null;

  const user = await UserModel.findById(session.userId);
  if (!user?.isActive) {
    await session.deleteOne();
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    session.lastSeenAt = now;
    session.expiresAt = sessionExpiry(session.createdAt, now, user.role);
    await session.save();
  }
  return user;
}

/** Ends the session behind `token`; a no-op when there is none. */
export async function deleteSession(token: string): Promise<void> {
  await SessionModel.deleteOne({ tokenHash: hashToken(token) });
}

/**
 * `GET /api/me`'s "was I just promoted?" check (plan 6.2): atomically reads and clears
 * `permissionsStale` in one write, so it is reported at most once even if `/me` is called twice in
 * quick succession. False for an unknown session token, which `requireAuth` would already have
 * refused before this ever runs.
 */
export async function consumePermissionsStale(token: string): Promise<boolean> {
  const session = await SessionModel.findOneAndUpdate(
    { tokenHash: hashToken(token) },
    { permissionsStale: false },
    { returnDocument: 'before' },
  ).lean();
  return session?.permissionsStale ?? false;
}

/**
 * Marks every session of a user `permissionsStale` (plan 6.1's promotion/demotion): unlike
 * `revokeUserSessions`, the sessions stay valid — only their role changed underneath them, not their
 * right to be logged in — so `/me` can flag it and the UI refreshes in place (LOE parity).
 */
export async function flagSessionsStale(
  userId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  await SessionModel.updateMany({ userId }, { permissionsStale: true }, { session });
}

/**
 * Marks the session behind `token` as having just passed `POST /api/auth/totp/reverify` (plan 9.1's
 * voter-file upload gate). `getTotpVerifiedAt`/`requireRecentTotp` check how long ago this was.
 */
export async function markTotpVerified(token: string): Promise<void> {
  await SessionModel.updateOne({ tokenHash: hashToken(token) }, { totpVerifiedAt: new Date() });
}

/** When the session behind `token` last passed a TOTP re-verification, or null (never, or unknown
 * session — `requireAuth` would already have refused the request before this runs). */
export async function getTotpVerifiedAt(token: string): Promise<Date | null> {
  const session = await SessionModel.findOne({ tokenHash: hashToken(token) })
    .select({ totpVerifiedAt: 1 })
    .lean();
  return session?.totpVerifiedAt ?? null;
}

/**
 * Ends every session of a user, except the one behind `keepToken` when given (the request's own,
 * after a password change). Runs in the transaction `session` of the change that requires it.
 */
export async function revokeUserSessions(
  userId: Types.ObjectId,
  { keepToken, session }: { keepToken?: string; session: ClientSession },
): Promise<void> {
  await SessionModel.deleteMany(
    keepToken ? { userId, tokenHash: { $ne: hashToken(keepToken) } } : { userId },
    { session },
  );
}
