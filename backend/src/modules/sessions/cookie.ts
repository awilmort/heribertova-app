import type { CookieOptions, Request, Response } from 'express';

/**
 * `__Host-` makes the browser insist on Secure, Path=/ and no Domain, so no subdomain or plain-http
 * page can set or overwrite it. Browsers treat http://localhost as a secure context, so the Secure
 * cookie also works in local development (Next.js on :3000 forwarding /api to the API).
 */
export const SESSION_COOKIE = '__Host-sid';

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

/** 32 bytes in base64url. Anything else in the cookie is ignored without a database lookup. */
const TOKEN_PATTERN = /^[\w-]{43}$/;

export function setSessionCookie(res: Response, token: string, maxAgeMs: number): void {
  res.cookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: maxAgeMs });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
}

/** The session token from the request's cookie (parsed by cookie-parser), or null. */
export function readSessionToken(req: Request): string | null {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];
  return typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : null;
}
