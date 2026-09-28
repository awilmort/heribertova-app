import { Secret, TOTP } from 'otpauth';

/** The TOTP_ENC_KEY of the test app (`testConfig`): 32 fixed bytes. */
export const TEST_TOTP_KEY = Buffer.from(
  'b2b4e1e4c4f1a3d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d',
  'hex',
);

/** The TOTP secret of every test superadmin (`createTestUser({ role: 'superadmin' })`). */
export const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

/** The code an authenticator app shows for `secret` at `timestampMs` (default: now). */
export function totpCodeAt(timestampMs = Date.now(), secret = TEST_TOTP_SECRET): string {
  return TOTP.generate({ secret: Secret.fromBase32(secret), timestamp: timestampMs });
}
