import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@heribertova/shared';
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

/** The only form ever stored or looked up: a leaked `sessions` collection holds no usable token. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await SessionModel.create({
    tokenHash: hashSessionToken(token),
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
  const session = await SessionModel.findOne({ tokenHash: hashSessionToken(token) });
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
  await SessionModel.deleteOne({ tokenHash: hashSessionToken(token) });
}
