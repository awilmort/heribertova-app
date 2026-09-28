import { Types } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, login } from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { createTestPerson } from '../../../test/users';
import { verifyPassword } from '../../lib/password';
import { PersonModel } from '../people/model';
import { UserModel } from './model';
import { createLoginForPerson, newPasswordProblem } from './service';

useTestDatabase();

beforeAll(async () => {
  await Promise.all([UserModel.createIndexes(), PersonModel.createIndexes()]);
});

const app = buildTestApp();

function personBornOn(birthDate: string) {
  return createTestPerson({
    registeredBy: new Types.ObjectId(),
    level: 'aspiring_leader',
    voterSnapshot: {
      fullName: 'MARÍA RODRÍGUEZ',
      recintoKey: 'liceo-juan-pablo-duarte--centro-ciudad',
      recintoName: 'LICEO JUAN PABLO DUARTE',
      colegioId: 4675,
      sector: 'CENTRO CIUDAD',
      birthDate,
    },
  });
}

describe('createLoginForPerson', () => {
  it('creates an account named by the cédula, on the default password, for the role', async () => {
    const person = await personBornOn('1985-03-15');

    const user = await createLoginForPerson(person, 'aspiring_leader');

    expect(user.toObject()).toMatchObject({
      personId: person._id,
      username: person.cedula,
      role: 'aspiring_leader',
      usingDefaultPassword: true,
      isActive: true,
      failedAttempts: 0,
      lockUntil: null,
      recintoScopes: [],
    });
    await expect(UserModel.countDocuments({ personId: person._id })).resolves.toBe(1);
  });

  it('stores an argon2id hash of the birth date as DDMMYYYY, never the password itself', async () => {
    const person = await personBornOn('1985-03-15');

    const user = await createLoginForPerson(person, 'team_leader');

    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain('15031985');
    await expect(verifyPassword(user.passwordHash, '15031985')).resolves.toBe(true);
    await expect(verifyPassword(user.passwordHash, '1985-03-15')).resolves.toBe(false);
  });

  it('keeps the calendar day of a New Year birth date (no time-zone shift)', async () => {
    const person = await personBornOn('2000-01-01');
    const user = await createLoginForPerson(person, 'aspiring_leader');
    await expect(verifyPassword(user.passwordHash, '01012000')).resolves.toBe(true);
    await expect(verifyPassword(user.passwordHash, '31121999')).resolves.toBe(false);
  });

  it.each([
    'general_coordinator',
    'recinto_coordinator',
    'team_leader',
    'aspiring_leader',
  ] as const)('lets a new %s log in with the birth date', async (role) => {
    const person = await personBornOn('1979-11-02');
    await createLoginForPerson(person, role);

    expect((await login(app, person.cedula, '02111979')).status).toBe(204);
    expect((await login(app, person.cedula, '1979-11-02')).status).toBe(401);
  });

  it('never gives the superadmin a birth-date password', async () => {
    const person = await personBornOn('1985-03-15');
    await expect(createLoginForPerson(person, 'superadmin' as never)).rejects.toThrow(
      'The superadmin never gets a birth-date password',
    );
    await expect(UserModel.countDocuments()).resolves.toBe(0);
  });

  it('refuses a second login for the same person', async () => {
    const person = await personBornOn('1985-03-15');
    await createLoginForPerson(person, 'aspiring_leader');
    await expect(createLoginForPerson(person, 'team_leader')).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('refuses a person whose birth date is not a "YYYY-MM-DD" string', async () => {
    const person = await personBornOn('1985-03-15');
    await expect(
      createLoginForPerson(
        { ...person.toObject(), voterSnapshot: { birthDate: '15/03/1985' } },
        'aspiring_leader',
      ),
    ).rejects.toThrow('Birth date is not a "YYYY-MM-DD" string');
    await expect(UserModel.countDocuments()).resolves.toBe(0);
  });
});

describe('newPasswordProblem', () => {
  const BIRTH_DATE = '1985-03-15';

  it('accepts a long enough password that is not the birth date', () => {
    expect(newPasswordProblem('abcdefgh', 'team_leader', BIRTH_DATE)).toBeNull();
    expect(newPasswordProblem('a'.repeat(14), 'superadmin', BIRTH_DATE)).toBeNull();
  });

  it('requires 8 characters, and 14 from the superadmin', () => {
    expect(newPasswordProblem('abcdefg', 'general_coordinator', BIRTH_DATE)).toBe(
      'La contraseña debe tener al menos 8 caracteres.',
    );
    expect(newPasswordProblem('a'.repeat(13), 'superadmin', BIRTH_DATE)).toBe(
      'La contraseña debe tener al menos 14 caracteres.',
    );
  });

  it('caps the length', () => {
    expect(newPasswordProblem('a'.repeat(257), 'superadmin', BIRTH_DATE)).toBe(
      'La contraseña es demasiado larga.',
    );
    expect(newPasswordProblem('a'.repeat(256), 'superadmin', BIRTH_DATE)).toBeNull();
  });

  it('refuses the birth date in either order, with or without separators', () => {
    for (const password of ['15031985', '1985-03-15', '15 / 03 / 1985']) {
      expect(newPasswordProblem(password, 'aspiring_leader', BIRTH_DATE)).toBe(
        'La nueva contraseña no puede ser su fecha de nacimiento.',
      );
    }
    expect(newPasswordProblem('15 / 03 / 1985', 'superadmin', BIRTH_DATE)).toBe(
      'La nueva contraseña no puede ser su fecha de nacimiento.',
    );
  });
});
