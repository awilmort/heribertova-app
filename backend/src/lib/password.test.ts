import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes with argon2id and never stores the password in clear', async () => {
    const hash = await hashPassword('15031985');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(hash).not.toContain('15031985');
  });

  it('salts every hash, so the same password hashes differently', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correcta-1');
    await expect(verifyPassword(hash, 'correcta-1')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'correcta-2')).resolves.toBe(false);
  });

  it('treats a malformed hash as a mismatch instead of throwing', async () => {
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });
});
