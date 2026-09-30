import { z } from 'zod';
import { SECRET_BOX_KEY_BYTES } from '../lib/secretBox';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Number of reverse-proxy hops to trust for the client IP (Express "trust proxy"). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  /** Login attempts allowed per client IP + cédula in a 15-minute window (on top of the account lockout). */
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  /** Padrón lookups (`GET /api/voters/:cedula`) each user may make per Santo Domingo day (plan 2.2). */
  VOTER_LOOKUP_DAILY_QUOTA: z.coerce.number().int().positive().default(300),
  /** Excel exports (`GET /api/exports/*.xlsx`) each user may generate per Santo Domingo day (plan 6.4). */
  EXPORTS_DAILY_QUOTA: z.coerce.number().int().positive().default(50),

  /**
   * The web app's origin (scheme://host[:port]), the only `Origin` accepted on unsafe requests
   * (CSRF guard). http://localhost:3000 locally, https://heribertova.do in production.
   */
  APP_ORIGIN: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin),
  /** Cloudflare Turnstile secret for the login bot check (the always-pass test secret locally). */
  TURNSTILE_SECRET_KEY: z.string().min(1),
  /**
   * AES-256-GCM key (32 bytes, base64: `openssl rand -base64 32`) that encrypts the superadmin's
   * TOTP secret at rest (lib/secretBox). Losing it means re-enrolling TOTP; changing it too.
   */
  TOTP_ENC_KEY: z
    .base64('must be base64 (openssl rand -base64 32)')
    .transform((value) => Buffer.from(value, 'base64'))
    .refine((key) => key.length === SECRET_BOX_KEY_BYTES, {
      message: `must decode to ${SECRET_BOX_KEY_BYTES} bytes (openssl rand -base64 32)`,
    }),

  // Object storage: AWS S3 in production, the S3-compatible emulator locally (docker-compose.dev.yml).
  AWS_REGION: z.string().min(1).default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  /** Custom S3 API endpoint (the local emulator). Leave unset in production so the SDK targets AWS. */
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  /** Path-style URLs (`endpoint/bucket/key`), which emulators need. AWS uses virtual-hosted style. */
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  /** Member photos (5.2). Also the bucket `GET /health` probes. */
  S3_MEDIA_BUCKET: z.string().min(1),
  /** Voter files uploaded by the browser with a presigned PUT (9.1). */
  S3_IMPORTS_BUCKET: z.string().min(1),
  /** The single kept database backup (9.3), replaced each time the superadmin makes a new one. */
  S3_BACKUP_BUCKET: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates the environment once at boot. Throws a single error naming every invalid variable
 * (never echoing values, which may be secrets) so the process fails fast.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}
