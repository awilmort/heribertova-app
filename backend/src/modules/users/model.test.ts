import { Types } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { createTestUser, uniqueCedula } from '../../../test/users';
import { PersonModel } from '../people/model';
import { UserModel } from './model';

useTestDatabase();

beforeAll(async () => {
  await Promise.all([UserModel.createIndexes(), PersonModel.createIndexes()]);
});

const DUPLICATE_KEY = { code: 11000 };

describe('UserModel', () => {
  it('applies the defaults of a new account', async () => {
    const user = await createTestUser();
    expect(user.toObject()).toMatchObject({
      recintoScopes: [],
      isActive: true,
      failedAttempts: 0,
      lockUntil: null,
      lastLoginAt: null,
    });
  });

  it('allows only one superadmin (unique partial index)', async () => {
    await createTestUser({ role: 'superadmin' });
    await expect(createTestUser({ role: 'superadmin' })).rejects.toMatchObject(DUPLICATE_KEY);
    await expect(UserModel.countDocuments({ role: 'superadmin' })).resolves.toBe(1);
  });

  it('refuses to turn a second account into a superadmin by update', async () => {
    await createTestUser({ role: 'superadmin' });
    const other = await createTestUser({ role: 'general_coordinator' });
    await expect(
      UserModel.updateOne({ _id: other._id }, { role: 'superadmin' }),
    ).rejects.toMatchObject(DUPLICATE_KEY);
  });

  it('allows any number of accounts in every other role', async () => {
    for (let i = 0; i < 3; i++) {
      await createTestUser({ role: 'team_leader' });
      await createTestUser({ role: 'general_coordinator' });
    }
    await expect(UserModel.countDocuments()).resolves.toBe(6);
  });

  it('allows one account per username', async () => {
    const username = uniqueCedula();
    await createTestUser({ username });
    await expect(createTestUser({ username })).rejects.toMatchObject(DUPLICATE_KEY);
  });

  it('allows one account per person', async () => {
    const user = await createTestUser();
    await expect(
      UserModel.create({
        personId: user.personId,
        username: uniqueCedula(),
        passwordHash: user.passwordHash,
        role: 'team_leader',
        usingDefaultPassword: true,
      }),
    ).rejects.toMatchObject(DUPLICATE_KEY);
  });

  it('rejects an unknown role and a username that is not a cédula', async () => {
    await expect(createTestUser({ role: 'member' as never })).rejects.toThrow(/role/);
    const valid = await createTestUser();
    await expect(
      UserModel.create({
        personId: new Types.ObjectId(),
        username: '001-1234567-2',
        passwordHash: valid.passwordHash,
        role: 'team_leader',
        usingDefaultPassword: true,
      }),
    ).rejects.toThrow(/username/);
  });
});
