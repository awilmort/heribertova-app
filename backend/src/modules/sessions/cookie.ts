import { SESSION_COOKIE } from '@heribertova/shared';
import type { CookieOptions, Request, Response } from 'express';

/**
 * The login cookies: the session (`__Host-sid`, shared with the frontend's `proxy.ts`) and, between
 * the superadmin's password and TOTP steps, the TOTP challenge (`__Host-totp`, backend-only: the
 * frontend never reads it, it just relies on the browser sending it back). Each carries a random
 * token whose hash is looked up in its own collection, so neither can stand in for the other.
 *
 * `__Host-` makes the browser insist on Secure, Path=/ and no Domain, so no subdomain or plain-http
 * page can set or overwrite them. Browsers treat http://localhost as a secure context, so Secure
 * cookies also work in local development (Next.js on :3000 forwarding /api to the API).
 */
export { SESSION_COOKIE };
export const TOTP_CHALLENGE_COOKIE = '__Host-totp';

type LoginCookie = typeof SESSION_COOKIE | typeof TOTP_CHALLENGE_COOKIE;

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

/** 32 bytes in base64url (lib/token). Anything else in the cookie is ignored without a database lookup. */
const TOKEN_PATTERN = /^[\w-]{43}$/;

function setTokenCookie(res: Response, name: LoginCookie, token: string, maxAgeMs: number): void {
  res.cookie(name, token, { ...COOKIE_OPTIONS, maxAge: maxAgeMs });
}

function clearTokenCookie(res: Response, name: LoginCookie): void {
  res.clearCookie(name, COOKIE_OPTIONS);
}

/** The token in the request's cookie `name` (parsed by cookie-parser), or null. */
function readTokenCookie(req: Request, name: LoginCookie): string | null {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : null;
}

export function setSessionCookie(res: Response, token: string, maxAgeMs: number): void {
  setTokenCookie(res, SESSION_COOKIE, token, maxAgeMs);
}

export function clearSessionCookie(res: Response): void {
  clearTokenCookie(res, SESSION_COOKIE);
}

export function readSessionToken(req: Request): string | null {
  return readTokenCookie(req, SESSION_COOKIE);
}

export function setTotpChallengeCookie(res: Response, token: string, maxAgeMs: number): void {
  setTokenCookie(res, TOTP_CHALLENGE_COOKIE, token, maxAgeMs);
}

export function clearTotpChallengeCookie(res: Response): void {
  clearTokenCookie(res, TOTP_CHALLENGE_COOKIE);
}

export function readTotpChallengeToken(req: Request): string | null {
  return readTokenCookie(req, TOTP_CHALLENGE_COOKIE);
}
