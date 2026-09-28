/**
 * Per-account progressive lockout (HERIBERTO_ARCHITECTURE.md §7): every 5th consecutive failure
 * locks the account, for 15 minutes the first time and twice as long each time after, up to a day.
 * A successful login resets the count.
 */
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_BASE_MS = 15 * 60 * 1000;
export const LOCKOUT_MAX_MS = 24 * 60 * 60 * 1000;

/** How long the `failedAttempts`-th consecutive failure locks the account; null when it does not. */
export function lockoutDurationMs(failedAttempts: number): number | null {
  if (failedAttempts < LOCKOUT_THRESHOLD || failedAttempts % LOCKOUT_THRESHOLD !== 0) return null;
  const lockoutNumber = failedAttempts / LOCKOUT_THRESHOLD;
  return Math.min(LOCKOUT_BASE_MS * 2 ** (lockoutNumber - 1), LOCKOUT_MAX_MS);
}
