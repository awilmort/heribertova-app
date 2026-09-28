import argon2 from 'argon2';

/**
 * argon2id with OWASP's minimum recommended parameters (19 MiB, 2 iterations, 1 lane): strong
 * enough for a login system and light on Render's 512 MB instance. The parameters are encoded in
 * each hash, so raising them later keeps old hashes verifiable.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, HASH_OPTIONS);
}

/** True when `password` matches `hash`. A malformed hash counts as a mismatch, never an error. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
