import { describe, expect, it } from 'vitest';
import { LOCKOUT_MAX_MS, lockoutDurationMs } from './lockout';

const MINUTE = 60 * 1000;

describe('lockoutDurationMs', () => {
  it.each([1, 2, 3, 4])('does not lock after %i failures', (failures) => {
    expect(lockoutDurationMs(failures)).toBeNull();
  });

  it('locks for 15 minutes at the 5th consecutive failure', () => {
    expect(lockoutDurationMs(5)).toBe(15 * MINUTE);
  });

  it.each([6, 7, 8, 9, 11])('does not lock again between thresholds (%i failures)', (failures) => {
    expect(lockoutDurationMs(failures)).toBeNull();
  });

  it('doubles the lock at every further 5 failures', () => {
    expect(lockoutDurationMs(10)).toBe(30 * MINUTE);
    expect(lockoutDurationMs(15)).toBe(60 * MINUTE);
    expect(lockoutDurationMs(20)).toBe(120 * MINUTE);
  });

  it('never locks for more than a day', () => {
    expect(lockoutDurationMs(35)).toBe(16 * 60 * MINUTE);
    expect(lockoutDurationMs(40)).toBe(LOCKOUT_MAX_MS);
    expect(lockoutDurationMs(500)).toBe(LOCKOUT_MAX_MS);
  });
});
