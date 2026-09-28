import { z } from 'zod';
import { cedulaSchema } from '../cedula';
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
    .max(256, 'La contraseña es demasiado larga.'),
  /** The Cloudflare Turnstile widget's response token, verified server-side. */
  turnstileToken: z.string().min(1, 'Complete la verificación.').max(2048),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

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
  /** The web page the role starts on (`/inicio` redirects there). */
  landing: z.string().startsWith('/'),
  /** True while the password is still the default (birth date): the UI keeps prompting to change it. */
  usingDefaultPassword: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
