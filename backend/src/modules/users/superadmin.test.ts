import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { importFakePadron } from '../../../test/padron';
import { TEST_TOTP_KEY } from '../../../test/totp';
import { createTestLogin, createTestPerson, createTestUser } from '../../../test/users';
import { verifyPassword } from '../../lib/password';
import { decryptSecret } from '../../lib/secretBox';
import { generateTotpSecret } from '../../lib/totp';
import { AuditLogModel } from '../audit/model';
import { PersonModel } from '../people/model';
import { RecintoModel } from '../recintos/model';
import { VoterModel } from '../voters/model';
import type { RawVoterRecord } from '../voters/voterFile';
import { UserModel } from './model';
import {
  assertNoSuperadmin,
  createSuperadmin,
  findOwnerVoter,
  SuperadminSetupError,
  type NewSuperadmin,
  type OwnerVoter,
} from './superadmin';

useTestDatabase();

const PASSWORD = 'una frase larga y segura';
const CONTACT = { phone: '8095551234', phoneWhatsapp: true };
const TOTP_STEP = 59_666_666;
const ALREADY_EXISTS = 'Ya existe un superadmin. Solo puede haber uno.';

let padron: RawVoterRecord[];

beforeAll(async () => {
  await Promise.all([UserModel.createIndexes(), PersonModel.createIndexes()]);
});

beforeEach(async () => {
  // Every test starts from a database with the padrón imported through the 2.1 import core.
  padron = await importFakePadron(400);
});

/** The i-th voter of the imported padrón. */
function voter(i: number): RawVoterRecord {
  const record = padron[i];
  if (!record) throw new Error(`No voter ${i}`);
  return record;
}

function newSuperadmin(owner: OwnerVoter, overrides: Partial<NewSuperadmin> = {}): NewSuperadmin {
  return {
    owner,
    contact: CONTACT,
    password: PASSWORD,
    totpSecret: generateTotpSecret(),
    totpStep: TOTP_STEP,
    ...overrides,
  };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  const err = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(err).toBeInstanceOf(SuperadminSetupError);
  return (err as Error).message;
}

describe('findOwnerVoter', () => {
  it('copies the owner from the imported padrón, with the recinto name', async () => {
    const record = voter(7);
    const recinto = await RecintoModel.findOne({
      _id: (await VoterModel.findById(record.cedula))?.recintoKey,
    });

    const owner = await findOwnerVoter(record.cedula);

    expect(owner).toEqual({
      cedula: record.cedula,
      existingPersonId: null,
      snapshot: {
        fullName: expect.stringContaining(record.apellido1) as string,
        recintoKey: recinto?._id,
        recintoName: recinto?.name,
        colegioId: record.idColegio,
        sector: record.descripcionSector,
        birthDate: record.fechaNacimiento,
      },
    });
  });

  it('refuses a cédula that is not in the padrón', async () => {
    expect(await refusal(findOwnerVoter('00000000001'))).toBe(
      'Esa cédula no está en el padrón activo de Higüey.',
    );
  });

  it('refuses a voter no longer in the active padrón', async () => {
    await VoterModel.updateOne({ _id: voter(3).cedula }, { status: 'inactive' });
    expect(await refusal(findOwnerVoter(voter(3).cedula))).toBe(
      'Esa cédula no está en el padrón activo de Higüey.',
    );
  });

  it('refuses a database without voters: the padrón must be imported first', async () => {
    await VoterModel.deleteMany({});
    expect(await refusal(findOwnerVoter(voter(0).cedula))).toMatch(/Importe el padrón primero/);
  });

  it('refuses a cédula that already has an account', async () => {
    await createTestUser({ role: 'general_coordinator', username: voter(5).cedula });
    expect(await refusal(findOwnerVoter(voter(5).cedula))).toBe('Esa cédula ya tiene una cuenta.');
  });

  it('points at the person the owner already has', async () => {
    const person = await createTestPerson({
      cedula: voter(4).cedula,
      registeredBy: (await createTestUser())._id,
    });
    expect((await findOwnerVoter(voter(4).cedula)).existingPersonId).toEqual(person._id);
  });
});

describe('createSuperadmin', () => {
  it('creates the owner as a person at the top of the structure and the superadmin account', async () => {
    const owner = await findOwnerVoter(voter(10).cedula);
    const input = newSuperadmin(owner);

    const user = await createSuperadmin(input, TEST_TOTP_KEY);

    const person = await PersonModel.findById(user.personId).lean();
    expect(person).toMatchObject({
      cedula: owner.cedula,
      voterSnapshot: owner.snapshot,
      phone: CONTACT.phone,
      phoneWhatsapp: true,
      level: 'coordinator',
      leaderId: null,
      ancestors: [],
      registeredBy: user._id,
      docStatus: 'pending',
      deletedAt: null,
    });
    const stored = await UserModel.findById(user._id).lean();
    expect(stored).toMatchObject({
      username: owner.cedula,
      role: 'superadmin',
      usingDefaultPassword: false,
      isActive: true,
      recintoScopes: [],
      totpLastUsedStep: TOTP_STEP,
    });
    expect(await verifyPassword(stored?.passwordHash ?? '', PASSWORD)).toBe(true);
  });

  it('stores the TOTP secret encrypted with TOTP_ENC_KEY, never in plain text', async () => {
    const input = newSuperadmin(await findOwnerVoter(voter(11).cedula));
    const user = await createSuperadmin(input, TEST_TOTP_KEY);
    const stored = await UserModel.findById(user._id).lean();

    expect(JSON.stringify(stored)).not.toContain(input.totpSecret);
    expect(decryptSecret(TEST_TOTP_KEY, stored?.totpSecretEnc ?? '')).toBe(input.totpSecret);
  });

  it('audits the creation, with the cédula masked', async () => {
    const owner = await findOwnerVoter(voter(12).cedula);
    const user = await createSuperadmin(newSuperadmin(owner), TEST_TOTP_KEY);

    const entries = await AuditLogModel.find().lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: user._id,
      action: 'user.superadmin_created',
      entity: 'user',
      entityId: user._id,
      ip: null,
    });
    expect(entries[0]?.summary).not.toContain(owner.cedula);
    expect(entries[0]?.summary).toContain(`${owner.cedula.slice(0, 3)}-*******-`);
  });

  it('reuses the person the owner already has, keeping their place in the structure', async () => {
    const registrar = await createTestUser();
    const person = await createTestPerson({
      cedula: voter(13).cedula,
      registeredBy: registrar._id,
      level: 'team_leader',
    });
    const owner = await findOwnerVoter(voter(13).cedula);

    const user = await createSuperadmin(newSuperadmin(owner, { contact: null }), TEST_TOTP_KEY);

    expect(user.personId).toEqual(person._id);
    await expect(PersonModel.countDocuments({ cedula: owner.cedula })).resolves.toBe(1);
    expect((await PersonModel.findById(person._id))?.level).toBe('team_leader');
  });

  it('requires the contact when the person has to be created', async () => {
    const owner = await findOwnerVoter(voter(14).cedula);
    await expect(
      createSuperadmin(newSuperadmin(owner, { contact: null }), TEST_TOTP_KEY),
    ).rejects.toThrow('A new person needs a phone number');
    await expect(UserModel.countDocuments()).resolves.toBe(0);
    await expect(PersonModel.countDocuments()).resolves.toBe(0);
  });

  describe('password', () => {
    it('requires at least 14 characters', async () => {
      const owner = await findOwnerVoter(voter(15).cedula);
      const input = newSuperadmin(owner, { password: 'x'.repeat(13) });
      expect(await refusal(createSuperadmin(input, TEST_TOTP_KEY))).toBe(
        'La contraseña debe tener al menos 14 caracteres.',
      );
      const accepted = newSuperadmin(owner, { password: 'x'.repeat(14) });
      await expect(createSuperadmin(accepted, TEST_TOTP_KEY)).resolves.toBeDefined();
    });

    it('refuses the birth date, even padded to 14 characters with separators', async () => {
      const owner = await findOwnerVoter(voter(16).cedula);
      const [year, month, day] = owner.snapshot.birthDate.split('-');
      for (const password of [`${day} / ${month} / ${year}`, `${year} - ${month} - ${day}`]) {
        expect(password).toHaveLength(14);
        expect(
          await refusal(createSuperadmin(newSuperadmin(owner, { password }), TEST_TOTP_KEY)),
        ).toBe('La nueva contraseña no puede ser su fecha de nacimiento.');
      }
      await expect(UserModel.countDocuments()).resolves.toBe(0);
    });
  });

  describe('only one superadmin', () => {
    it('refuses a second one', async () => {
      await createSuperadmin(newSuperadmin(await findOwnerVoter(voter(20).cedula)), TEST_TOTP_KEY);
      const second = newSuperadmin(await findOwnerVoter(voter(21).cedula));

      expect(await refusal(createSuperadmin(second, TEST_TOTP_KEY))).toBe(ALREADY_EXISTS);
      await expect(UserModel.countDocuments({ role: 'superadmin' })).resolves.toBe(1);
      // The refused attempt left nothing behind.
      await expect(PersonModel.countDocuments({ cedula: voter(21).cedula })).resolves.toBe(0);
    });

    it('lets exactly one of two simultaneous runs win (the unique index decides)', async () => {
      const inputs = await Promise.all(
        [30, 31, 32].map(async (i) => newSuperadmin(await findOwnerVoter(voter(i).cedula))),
      );

      const results = await Promise.allSettled(
        inputs.map((input) => createSuperadmin(input, TEST_TOTP_KEY)),
      );

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      for (const result of results.filter((r) => r.status === 'rejected')) {
        expect(result.reason).toBeInstanceOf(SuperadminSetupError);
        expect((result.reason as Error).message).toBe(ALREADY_EXISTS);
      }
      await expect(UserModel.countDocuments({ role: 'superadmin' })).resolves.toBe(1);
      await expect(PersonModel.countDocuments()).resolves.toBe(1);
      await expect(AuditLogModel.countDocuments()).resolves.toBe(1);
    });

    it('assertNoSuperadmin refuses once a superadmin exists, however it was created', async () => {
      await expect(assertNoSuperadmin()).resolves.toBeUndefined();
      const person = await createTestPerson({
        cedula: voter(40).cedula,
        registeredBy: (await createTestUser())._id,
      });
      await createTestLogin(person, { role: 'superadmin' });
      expect(await refusal(assertNoSuperadmin())).toBe(ALREADY_EXISTS);
    });
  });
});
