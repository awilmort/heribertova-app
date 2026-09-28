import type { Role } from './roles';

/** Minimum length of a password a user chooses (HERIBERTO_ARCHITECTURE.md §7). */
export const PASSWORD_MIN_LENGTH = 8;
/** The superadmin can do everything, so its password must be strong (§7, plan 3.3). */
export const SUPERADMIN_PASSWORD_MIN_LENGTH = 14;
/** Caps the work a single password costs the server (argon2 hashes the whole value). */
export const PASSWORD_MAX_LENGTH = 256;

export const PASSWORD_TOO_LONG_MESSAGE = 'La contraseña es demasiado larga.';

export function minPasswordLength(role: Role): number {
  return role === 'superadmin' ? SUPERADMIN_PASSWORD_MIN_LENGTH : PASSWORD_MIN_LENGTH;
}

/** "La contraseña debe tener al menos 8 caracteres." */
export function passwordTooShortMessage(minLength: number): string {
  return `La contraseña debe tener al menos ${minLength} caracteres.`;
}
