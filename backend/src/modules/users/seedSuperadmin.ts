import { cedulaDigits, cedulaSchema } from '@heribertova/shared';
import { setupSuperadmin } from './superadmin';

/**
 * Creates the superadmin for local development and manual testing, without needing to fill in the
 * `/configuracion-inicial` form by hand. Fabricates the profile details `setupSuperadmin` requires,
 * so a fresh local database can have a working superadmin in one command. It goes through the same
 * `setupSuperadmin` the real flow uses, so every other invariant still holds: exactly one
 * superadmin, the audit entry, the password rules, and TOTP enrolled at first login.
 * `scripts/seed-superadmin.ts` refuses to run this outside development.
 */

const SYNTHETIC_DETAILS = {
  fullName: 'SUPERADMIN DE PRUEBA',
  birthDate: '1990-01-01',
  phone: '8091234567',
  phoneWhatsapp: false,
  recintoName: 'RECINTO DE PRUEBA (SEED)',
  sector: 'SECTOR DE PRUEBA',
} as const;

export interface SeedSuperadminOptions {
  cedula: string;
  password: string;
}

export interface SeededSuperadmin {
  userId: string;
  cedula: string;
}

export async function seedSuperadmin(
  { cedula, password }: SeedSuperadminOptions,
  totpKey: Buffer,
): Promise<SeededSuperadmin> {
  const digits = cedulaDigits(cedula);
  const parsed = cedulaSchema.safeParse(digits);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Cédula inválida.');
  }

  const user = await setupSuperadmin({ cedula: digits, password, ...SYNTHETIC_DETAILS }, totpKey);
  return { userId: user.id, cedula: digits };
}
