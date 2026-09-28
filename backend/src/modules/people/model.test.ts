import { Types } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { createTestPerson, uniqueCedula } from '../../../test/users';
import { PersonModel } from './model';

useTestDatabase();

beforeAll(async () => {
  await PersonModel.createIndexes();
});

const registeredBy = new Types.ObjectId();

describe('PersonModel', () => {
  it('stores a person with the optional fields defaulted', async () => {
    const person = await createTestPerson({ registeredBy });
    expect(person.toObject()).toMatchObject({
      nickname: null,
      phone2: null,
      phone2Whatsapp: null,
      email: null,
      leaderId: null,
      ancestors: [],
      status: null,
      validatedBy: null,
      validatedAt: null,
      deletedAt: null,
    });
    expect(person.photos.cedula).toBeUndefined();
    expect(person.photos.selfie).toBeUndefined();
  });

  it('allows one person per cédula', async () => {
    const cedula = uniqueCedula();
    await createTestPerson({ cedula, registeredBy });
    await expect(createTestPerson({ cedula, registeredBy })).rejects.toMatchObject({ code: 11000 });
  });

  it('keeps the birth date as a "YYYY-MM-DD" string', async () => {
    const person = await createTestPerson({ registeredBy });
    expect(person.voterSnapshot.birthDate).toBe('1985-03-15');
    await expect(
      createTestPerson({
        registeredBy,
        voterSnapshot: { ...person.voterSnapshot, birthDate: '15/03/1985' },
      }),
    ).rejects.toThrow(/birthDate/);
  });

  it('rejects unknown levels, statuses and document statuses', async () => {
    await expect(createTestPerson({ registeredBy, level: 'boss' as never })).rejects.toThrow(
      /level/,
    );
    await expect(createTestPerson({ registeredBy, status: 'away' as never })).rejects.toThrow(
      /status/,
    );
    await expect(createTestPerson({ registeredBy, docStatus: 'done' as never })).rejects.toThrow(
      /docStatus/,
    );
  });

  it('declares the indexes of architecture §5', async () => {
    const indexes = await PersonModel.collection.indexes();
    const keys = indexes.map((index) => index.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        { cedula: 1 },
        { leaderId: 1, deletedAt: 1 },
        { ancestors: 1 },
        { 'voterSnapshot.recintoKey': 1 },
        { 'voterSnapshot.sector': 1 },
        { level: 1 },
      ]),
    );
    expect(indexes.find((index) => index.key.cedula === 1)?.unique).toBe(true);
  });
});
