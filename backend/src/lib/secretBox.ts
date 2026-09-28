import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption at rest for small secrets the server must read back (the superadmin's TOTP secret):
 * AES-256-GCM with a random 96-bit IV per value. GCM authenticates the ciphertext, so a tampered
 * value, or one encrypted under another key, fails to decrypt instead of yielding garbage.
 *
 * Stored form: `v1.<iv>.<auth tag>.<ciphertext>`, each part base64url. The version prefix leaves
 * room for a future algorithm or key rotation.
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
export const SECRET_BOX_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function assertKey(key: Buffer): void {
  if (key.length !== SECRET_BOX_KEY_BYTES) {
    throw new Error(`The encryption key must be ${SECRET_BOX_KEY_BYTES} bytes`);
  }
}

export function encryptSecret(key: Buffer, plaintext: string): string {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** Throws when `box` is malformed, was tampered with, or was encrypted under another key. */
export function decryptSecret(key: Buffer, box: string): string {
  assertKey(key);
  const [version, iv, tag, ciphertext, ...rest] = box.split('.');
  if (
    version !== VERSION ||
    iv === undefined ||
    tag === undefined ||
    ciphertext === undefined ||
    rest.length > 0
  ) {
    throw new Error('Not an encrypted secret');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
