import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashToken, newSecretToken } from './token';

describe('newSecretToken', () => {
  it('is 32 random bytes in base64url', () => {
    const token = newSecretToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 100 }, newSecretToken));
    expect(tokens.size).toBe(100);
  });
});

describe('hashToken', () => {
  it('is the hex SHA-256 of the token', () => {
    expect(hashToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
