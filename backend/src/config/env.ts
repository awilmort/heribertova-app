import { z } from 'zod';

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
