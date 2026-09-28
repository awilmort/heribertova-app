import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { createTestUser, DEFAULT_TEST_PASSWORD, uniqueCedula } from '../../../test/users';
import { UserModel } from '../users/model';
import { authenticate } from './service';

useTestDatabase();

describe('authenticate', () => {
  it('returns the user for the right password', async () => {
    const user = await createTestUser();
    const result = await authenticate(user.username, DEFAULT_TEST_PASSWORD);
    expect(result.ok && result.user.id).toBe(user.id);
  });

  it('names the reason of each failure (for the logs)', async () => {
    const active = await createTestUser();
    const inactive = await createTestUser({ isActive: false });
    const locked = await createTestUser({ lockUntil: new Date(Date.now() + 60_000) });

    await expect(authenticate(uniqueCedula(), 'x')).resolves.toEqual({
      ok: false,
      reason: 'unknown_user',
    });
    await expect(authenticate(active.username, 'x')).resolves.toEqual({
      ok: false,
      reason: 'wrong_password',
    });
    await expect(authenticate(inactive.username, DEFAULT_TEST_PASSWORD)).resolves.toEqual({
      ok: false,
      reason: 'inactive',
    });
    await expect(authenticate(locked.username, DEFAULT_TEST_PASSWORD)).resolves.toEqual({
      ok: false,
      reason: 'locked',
    });
  });

  it('does not count failures against a deactivated account', async () => {
    const user = await createTestUser({ isActive: false });
    await authenticate(user.username, 'x');
    expect((await UserModel.findById(user._id))?.failedAttempts).toBe(0);
  });

  it('counts concurrent failures without losing any', async () => {
    const user = await createTestUser();
    await Promise.all(Array.from({ length: 4 }, () => authenticate(user.username, 'x')));
    expect((await UserModel.findById(user._id))?.failedAttempts).toBe(4);
  });

  it('accepts a login once an earlier lock has passed', async () => {
    const user = await createTestUser({
      failedAttempts: 5,
      lockUntil: new Date(Date.now() - 1),
    });
    const result = await authenticate(user.username, DEFAULT_TEST_PASSWORD);
    expect(result.ok).toBe(true);
  });
});
