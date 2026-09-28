import { createHash, randomBytes } from 'node:crypto';

/**
 * Bearer secrets kept in cookies (session and TOTP-challenge tokens). The browser holds the token;
 * the database holds only its SHA-256, so a leaked collection yields nothing usable.
 */

/** A fresh 256-bit random token, base64url (43 characters). Never stored or logged. */
export function newSecretToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The only form of a token ever stored or looked up: its SHA-256, hex. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
