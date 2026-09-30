import { z } from 'zod';
import { cedulaSchema } from '../cedula';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_LONG_MESSAGE,
  passwordTooShortMessage,
} from '../passwords';
import { permissionSchema } from '../permissions';
import { roleSchema } from '../roles';

/**
 * `POST /api/auth/login`. The cédula is the username (11 digits, unformatted). The password is
 * capped so a huge value cannot make the server spend long on hashing it.
 */
export const loginRequestSchema = z.object({
  cedula: cedulaSchema,
  password: z
    .string()
    .min(1, 'Ingrese su contraseña.')
    .max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG_MESSAGE),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * `POST /api/auth/login` answers 204 with the session cookie, except for the superadmin: then it
 * answers 202 with this body and a short-lived TOTP challenge cookie, which grants no access
 * until `POST /api/auth/totp/verify` accepts a code. `enrollment` is present only the first time,
 * before any code has ever been accepted (`users.totpLastUsedStep` still null): the superadmin's
 * secret is generated at account setup already, but never shown until this first login, so the QR
 * code lives in the app instead of a CLI the operator has to remember to keep.
 */
export const totpRequiredResponseSchema = z.object({
  totpRequired: z.literal(true),
  enrollment: z.object({ secret: z.string(), qrDataUrl: z.string() }).optional(),
});
export type TotpRequiredResponse = z.infer<typeof totpRequiredResponseSchema>;

/** `POST /api/auth/totp/verify`: the 6-digit code of the authenticator app, without spaces. */
export const totpVerifyRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Ingrese los 6 dígitos del código.'),
});
export type TotpVerifyRequest = z.infer<typeof totpVerifyRequestSchema>;

/** `GET /api/me`: who is logged in. */
export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    /** The cédula. */
    username: z.string(),
  }),
  person: z.object({
    id: z.string(),
    fullName: z.string(),
    nickname: z.string().nullable(),
    recintoKey: z.string(),
    recintoName: z.string(),
    colegioId: z.number(),
    sector: z.string(),
  }),
  role: roleSchema,
  /** What the role may do (`ROLE_PERMISSIONS`): drives the navigation and what the UI offers. */
  permissions: z.array(permissionSchema),
  /** recintoKeys a recinto_coordinator covers; empty for every other role. Plan 7.1's `/mi-recinto`
   * uses it to know which recinto(s) the caller may pick from. */
  recintoScopes: z.array(z.string()),
  /** The web page the role starts on (`/inicio` redirects there). */
  landing: z.string().startsWith('/'),
  /** True while the password is still the default (birth date): the UI keeps prompting to change it. */
  usingDefaultPassword: z.boolean(),
  /** True exactly once, on the first `/me` after this session's role changed underneath it (plan
   * 6.1/6.2's auto-promotion or a manual promote/demote): the server clears it as it reports it, so
   * the UI shows the celebration/notice on this one response and never repeats it. `role`/
   * `permissions`/`landing` above are already current either way. */
  permissionsStale: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * `PUT /api/me/password`. The server also refuses the user's birth date (the default password) and,
 * for the superadmin, anything shorter than `SUPERADMIN_PASSWORD_MIN_LENGTH`.
 */
export const changePasswordRequestSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Ingrese su contraseña actual.')
    .max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG_MESSAGE),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, passwordTooShortMessage(PASSWORD_MIN_LENGTH))
    .max(PASSWORD_MAX_LENGTH, PASSWORD_TOO_LONG_MESSAGE),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
