import { Secret, TOTP } from 'otpauth';

/**
 * Time-based one-time passwords (RFC 6238) for the superadmin's second login step, with the
 * parameters every authenticator app supports: HMAC-SHA1, 6 digits, 30-second steps.
 */

const ALGORITHM = 'SHA1';
const DIGITS = 6;
const PERIOD_SECONDS = 30;
/** Codes of the step before and after the current one are accepted too (phone clock drift). */
const WINDOW_STEPS = 1;
/** 160 bits, the secret size RFC 4226 recommends. */
const SECRET_BYTES = 20;

/** The name the authenticator app shows above the code. */
const TOTP_ISSUER = 'heribertova.do';

/** A new random secret, base32 (what authenticator apps and the otpauth URI use). */
export function generateTotpSecret(): string {
  return new Secret({ size: SECRET_BYTES }).base32;
}

function totpFor(secret: string, label: string): TOTP {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret: Secret.fromBase32(secret),
  });
}

/**
 * The `otpauth://totp/...` URI an authenticator app enrolls from (usually as a QR code). `label`
 * names the account in the app; keep personal data such as the cédula out of it.
 */
export function totpUri(secret: string, label: string): string {
  return totpFor(secret, label).toString();
}

/**
 * The time step (30-second counter since the Unix epoch) whose code `code` is, within one step of
 * `timestampMs`; null when it matches none. Callers accept each step at most once (replay).
 */
export function matchTotpStep(secret: string, code: string, timestampMs: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totpFor(secret, 'verify').validate({
    token: code,
    timestamp: timestampMs,
    window: WINDOW_STEPS,
  });
  return delta === null
    ? null
    : TOTP.counter({ period: PERIOD_SECONDS, timestamp: timestampMs }) + delta;
}
