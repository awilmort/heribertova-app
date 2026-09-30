import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { TEST_TOTP_KEY, totpCodeAt } from '../../../test/totp';
import { createTestLogin, createTestPerson, createTestUser } from '../../../test/users';
import { verifyPassword } from '../../lib/password';
import { matchTotpStep } from '../../lib/totp';
import { PersonModel } from '../people/model';
import { UserModel } from './model';
import { seedSuperadmin } from './seedSuperadmin';
import { SuperadminSetupError } from './superadmin';

useTestDatabase();

const PASSWORD = 'DevSuperadmin2024!';
const ALREADY_EXISTS = 'Ya existe un superadmin. Solo puede haber uno.';

beforeAll(async () => {
  await Promise.all([UserModel.createIndexes(), PersonModel.createIndexes()]);
});

describe('seedSuperadmin', () => {
  it('creates a superadmin from a bare cédula, no imported padrón needed', async () => {
    await expect(UserModel.exists({})).resolves.toBeNull();

    const result = await seedSuperadmin(
      { cedula: '00100000001', password: PASSWORD },
      TEST_TOTP_KEY,
    );

    const user = await UserModel.findById(result.userId).lean();
    expect(user).toMatchObject({ username: '00100000001', role: 'superadmin', isActive: true });
    expect(await verifyPassword(user?.passwordHash ?? '', PASSWORD)).toBe(true);

    const person = await PersonModel.findById(user?.personId).lean();
    expect(person).toMatchObject({ cedula: '00100000001', level: 'coordinator' });
  });

  it('accepts a formatted cédula (dashes, spaces)', async () => {
    const result = await seedSuperadmin(
      { cedula: '001-0000000-1', password: PASSWORD },
      TEST_TOTP_KEY,
    );
    expect(result.cedula).toBe('00100000001');
  });

  it('refuses a cédula that is not 11 digits', async () => {
    await expect(
      seedSuperadmin({ cedula: '123', password: PASSWORD }, TEST_TOTP_KEY),
    ).rejects.toThrow('La cédula debe tener 11 dígitos.');
    await expect(UserModel.countDocuments()).resolves.toBe(0);
  });

  it('returns a TOTP secret whose current code the login flow would accept', async () => {
    const result = await seedSuperadmin(
      { cedula: '00100000001', password: PASSWORD },
      TEST_TOTP_KEY,
    );
    const now = Date.now();
    expect(
      matchTotpStep(result.totpSecret, totpCodeAt(now, result.totpSecret), now),
    ).not.toBeNull();
  });

  it('still enforces the password rules (≥14 characters, not the birth date)', async () => {
    await expect(
      seedSuperadmin({ cedula: '00100000001', password: 'short' }, TEST_TOTP_KEY),
    ).rejects.toThrow(SuperadminSetupError);
    await expect(UserModel.countDocuments()).resolves.toBe(0);
  });

  it('refuses a second superadmin, whether the first was seeded or created for real', async () => {
    const registrar = await createTestUser();
    const person = await createTestPerson({ registeredBy: registrar._id });
    await createTestLogin(person, { role: 'superadmin' });

    await expect(
      seedSuperadmin({ cedula: '00100000002', password: PASSWORD }, TEST_TOTP_KEY),
    ).rejects.toThrow(ALREADY_EXISTS);
  });
});
