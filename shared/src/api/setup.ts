import { z } from 'zod';
import { cedulaSchema } from '../cedula';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_TOO_LONG_MESSAGE,
  passwordTooShortMessage,
  SUPERADMIN_PASSWORD_MIN_LENGTH,
} from '../passwords';
import { phoneSchema } from '../phone';

/** `GET /api/setup/status` (public): whether the one-time superadmin setup is still open. Once a
 * superadmin exists, this is permanently `false` (HERIBERTO_ARCHITECTURE.md §7). */
export const setupStatusResponseSchema = z.object({ needed: z.boolean() });
export type SetupStatusResponse = z.infer<typeof setupStatusResponseSchema>;

/**
 * `POST /api/setup/superadmin` (public, one-time only, plan 3.3): creates the one superadmin from
 * details typed in the app instead of a padrón lookup, so it works before any voter file is
 * imported. Unlike a regular member, nothing here is checked against `voters`: the campaign owner
 * vouches for their own data directly.
 */
export const setupSuperadminRequestSchema = z.object({
  cedula: cedulaSchema,
  fullName: z.string().trim().min(1, 'Ingrese el nombre completo.').max(120),
  /** "YYYY-MM-DD"; also what the password may not equal (§7). */
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ingrese una fecha de nacimiento válida.'),
  phone: phoneSchema,
  phoneWhatsapp: z.boolean(),
  recintoName: z.string().trim().min(1, 'Ingrese su recinto de votación.').max(120),
  sector: z.string().trim().min(1, 'Ingrese su sector.').max(120),
  password: z
    .string()
    .min(SUPERADMIN_PASSWORD_MIN_LENGTH, passwordTooShortMessage(SUPERADMIN_PASSWORD_MIN_LENGTH))
    .max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG_MESSAGE),
});
export type SetupSuperadminRequest = z.infer<typeof setupSuperadminRequestSchema>;
