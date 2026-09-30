import { cedulaDigits, cedulaSchema } from '@heribertova/shared';
import { currentTotpCode, generateTotpSecret, matchTotpStep, totpUri } from '../../lib/totp';
import { assertNoSuperadmin, createSuperadmin, type OwnerVoter } from './superadmin';

/**
 * Creates the superadmin for local development and manual testing, without an imported padrón.
 * The real flow (plan 3.3, `superadminCli.ts`) ties the superadmin to an actual Higüey voter; this
 * fabricates one instead, so a fresh local database can have a working superadmin in one command.
 * It goes through the same `createSuperadmin` the real flow uses, so every other invariant still
 * holds: exactly one superadmin, the audit entry, the password rules, and TOTP on login.
 * `scripts/seed-superadmin.ts` refuses to run this outside development.
 */

const SYNTHETIC_SNAPSHOT = {
  fullName: 'SUPERADMIN DE PRUEBA',
  recintoKey: 'recinto-dev--sector-dev',
  recintoName: 'RECINTO DE PRUEBA (SEED)',
  colegioId: 1,
  sector: 'SECTOR DE PRUEBA',
  birthDate: '1990-01-01',
} as const;

const SYNTHETIC_CONTACT = { phone: '8091234567', phoneWhatsapp: false };

/** The account's cédula does not have to belong to a real voter, but it does need TOTP_LABEL. */
const TOTP_LABEL = 'superadmin-dev';

export interface SeedSuperadminOptions {
  cedula: string;
  password: string;
}

export interface SeededSuperadmin {
  userId: string;
  cedula: string;
  /** Base32; print it (or the QR of `totpUri`) so the operator can enroll an authenticator app. */
  totpSecret: string;
  totpUri: string;
}

export async function seedSuperadmin(
  { cedula, password }: SeedSuperadminOptions,
  totpKey: Buffer,
): Promise<SeededSuperadmin> {
  await assertNoSuperadmin();

  const digits = cedulaDigits(cedula);
  const parsed = cedulaSchema.safeParse(digits);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Cédula inválida.');
  }

  const owner: OwnerVoter = {
    cedula: digits,
    existingPersonId: null,
    snapshot: SYNTHETIC_SNAPSHOT,
  };
  const totpSecret = generateTotpSecret();
  const now = Date.now();
  const totpStep = matchTotpStep(totpSecret, currentTotpCode(totpSecret, now), now);
  if (totpStep === null) throw new Error('The freshly generated TOTP code did not validate');

  const user = await createSuperadmin(
    { owner, contact: SYNTHETIC_CONTACT, password, totpSecret, totpStep },
    totpKey,
  );

  return { userId: user.id, cedula: digits, totpSecret, totpUri: totpUri(totpSecret, TOTP_LABEL) };
}
