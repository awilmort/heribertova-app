import type { SetupSuperadminRequest } from '@heribertova/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { TEST_TOTP_KEY } from '../../../test/totp';
import { createTestLogin, createTestPerson, createTestUser, uniqueCedula } from '../../../test/users';
import { verifyPassword } from '../../lib/password';
import { decryptSecret } from '../../lib/secretBox';
import { AuditLogModel } from '../audit/model';
import { PersonModel } from '../people/model';
import { UserModel } from './model';
import { assertNoSuperadmin, setupSuperadmin, SuperadminSetupError } from './superadmin';

useTestDatabase();

const PASSWORD = 'una frase larga y segura';
const ALREADY_EXISTS = 'Ya existe un superadmin. Solo puede haber uno.';

const DETAILS = {
  fullName: 'JUAN PÉREZ',
  birthDate: '1985-03-15',
  phone: '8095551234',
  phoneWhatsapp: true,
  recintoName: 'LICEO CENTRO',
  sector: 'CENTRO',
} as const;

beforeAll(async () => {
  await Promise.all([UserModel.createIndexes(), PersonModel.createIndexes()]);
});

function request(overrides: Partial<SetupSuperadminRequest> = {}): SetupSuperadminRequest {
  return { cedula: uniqueCedula(), password: PASSWORD, ...DETAILS, ...overrides };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  const err = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(err).toBeInstanceOf(SuperadminSetupError);
  return (err as Error).message;
}

describe('setupSuperadmin', () => {
  it('creates a person at the top of the structure and the superadmin account, TOTP unconfirmed', async () => {
    const input = request();

    const user = await setupSuperadmin(input, TEST_TOTP_KEY);

    const person = await PersonModel.findById(user.personId).lean();
    expect(person).toMatchObject({
      cedula: input.cedula,
      voterSnapshot: {
        fullName: DETAILS.fullName,
        recintoKey: 'liceo-centro',
        recintoName: DETAILS.recintoName,
        colegioId: 0,
        sector: DETAILS.sector,
        birthDate: DETAILS.birthDate,
      },
      phone: DETAILS.phone,
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
      username: input.cedula,
      role: 'superadmin',
      usingDefaultPassword: false,
      isActive: true,
      recintoScopes: [],
      totpLastUsedStep: null,
    });
    expect(await verifyPassword(stored?.passwordHash ?? '', PASSWORD)).toBe(true);
  });

  it('generates a TOTP secret and stores it encrypted with TOTP_ENC_KEY, never in plain text', async () => {
    const user = await setupSuperadmin(request(), TEST_TOTP_KEY);
    const stored = await UserModel.findById(user._id).lean();

    expect(stored?.totpSecretEnc).toBeTruthy();
    // Decrypting with the right key never throws; the plaintext secret itself is never asserted
    // here, since it isn't returned to the caller (only revealed at first login).
    expect(() => decryptSecret(TEST_TOTP_KEY, stored?.totpSecretEnc ?? '')).not.toThrow();
  });

  it('audits the creation, with the cédula masked', async () => {
    const input = request();
    const user = await setupSuperadmin(input, TEST_TOTP_KEY);

    const entries = await AuditLogModel.find().lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: user._id,
      action: 'user.superadmin_created',
      entity: 'user',
      entityId: user._id,
      ip: null,
    });
    expect(entries[0]?.summary).not.toContain(input.cedula);
    expect(entries[0]?.summary).toContain(`${input.cedula.slice(0, 3)}-*******-`);
  });

  describe('password', () => {
    it('requires at least 14 characters', async () => {
      const short = request({ password: 'x'.repeat(13) });
      expect(await refusal(setupSuperadmin(short, TEST_TOTP_KEY))).toBe(
        'La contraseña debe tener al menos 14 caracteres.',
      );
      const accepted = request({ password: 'x'.repeat(14) });
      await expect(setupSuperadmin(accepted, TEST_TOTP_KEY)).resolves.toBeDefined();
    });

    it('refuses the birth date, even padded to 14 characters with separators', async () => {
      const [year, month, day] = DETAILS.birthDate.split('-');
      for (const password of [`${day} / ${month} / ${year}`, `${year} - ${month} - ${day}`]) {
        expect(password).toHaveLength(14);
        expect(await refusal(setupSuperadmin(request({ password }), TEST_TOTP_KEY))).toBe(
          'La nueva contraseña no puede ser su fecha de nacimiento.',
        );
      }
      await expect(UserModel.countDocuments()).resolves.toBe(0);
    });
  });

  describe('only one superadmin', () => {
    it('refuses a second one', async () => {
      await setupSuperadmin(request(), TEST_TOTP_KEY);
      const second = request();

      expect(await refusal(setupSuperadmin(second, TEST_TOTP_KEY))).toBe(ALREADY_EXISTS);
      await expect(UserModel.countDocuments({ role: 'superadmin' })).resolves.toBe(1);
      // The refused attempt left nothing behind.
      await expect(PersonModel.countDocuments({ cedula: second.cedula })).resolves.toBe(0);
    });

    it('lets exactly one of three simultaneous runs win (the unique index decides)', async () => {
      const inputs = [request(), request(), request()];

      const results = await Promise.allSettled(
        inputs.map((input) => setupSuperadmin(input, TEST_TOTP_KEY)),
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
        cedula: uniqueCedula(),
        registeredBy: (await createTestUser())._id,
      });
      await createTestLogin(person, { role: 'superadmin' });
      expect(await refusal(assertNoSuperadmin())).toBe(ALREADY_EXISTS);
    });
  });
});
