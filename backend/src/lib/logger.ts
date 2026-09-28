import { pino, type DestinationStream, type Logger } from 'pino';

export type { Logger } from 'pino';

/** Personal data and secrets that must never reach log output, at the top level or nested up to two levels. */
const SENSITIVE_KEYS = [
  'password',
  'currentPassword',
  'newPassword',
  'cedula',
  'phone',
  'phone2',
  'email',
  'token',
  'totp',
  'cookie',
  'authorization',
];

export const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino({ level, redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, destination);
}
