import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secretBox';

const key = randomBytes(32);
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    expect(decryptSecret(key, encryptSecret(key, SECRET))).toBe(SECRET);
  });

  it('never stores the plaintext and uses a fresh IV every time', () => {
    const first = encryptSecret(key, SECRET);
    const second = encryptSecret(key, SECRET);
    expect(first).not.toContain(SECRET);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/);
  });

  it('refuses a value encrypted under another key', () => {
    const box = encryptSecret(randomBytes(32), SECRET);
    expect(() => decryptSecret(key, box)).toThrow();
  });

  it('refuses a tampered ciphertext, IV or tag', () => {
    const [version, iv, tag, ciphertext] = encryptSecret(key, SECRET).split('.') as [
      string,
      string,
      string,
      string,
    ];
    const flip = (part: string) => {
      const bytes = Buffer.from(part, 'base64url');
      bytes[0] = (bytes[0] ?? 0) ^ 1;
      return bytes.toString('base64url');
    };
    for (const box of [
      [version, iv, tag, flip(ciphertext)],
      [version, flip(iv), tag, ciphertext],
      [version, iv, flip(tag), ciphertext],
    ]) {
      expect(() => decryptSecret(key, box.join('.'))).toThrow();
    }
  });

  it('refuses a truncated authentication tag', () => {
    const [version, iv, tag, ciphertext] = encryptSecret(key, SECRET).split('.') as [
      string,
      string,
      string,
      string,
    ];
    const short = Buffer.from(tag, 'base64url').subarray(0, 4).toString('base64url');
    expect(() => decryptSecret(key, [version, iv, short, ciphertext].join('.'))).toThrow();
  });

  it('refuses a malformed value', () => {
    for (const box of ['', SECRET, 'v2.a.b.c', 'v1.a.b', 'v1.a.b.c.d']) {
      expect(() => decryptSecret(key, box)).toThrow('Not an encrypted secret');
    }
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => encryptSecret(randomBytes(16), SECRET)).toThrow('32 bytes');
    expect(() => decryptSecret(randomBytes(16), 'v1.a.b.c')).toThrow('32 bytes');
  });
});
