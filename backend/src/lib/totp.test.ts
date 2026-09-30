import { Secret, TOTP } from 'otpauth';
import { describe, expect, it } from 'vitest';
import { currentTotpCode, generateTotpSecret, matchTotpStep, totpUri } from './totp';

/** RFC 6238 appendix B: the SHA-1 seed is the ASCII string "12345678901234567890". */
const RFC_SECRET = Secret.fromLatin1('12345678901234567890').base32;

/** RFC 6238 appendix B, SHA-1: Unix time (s) → the 8-digit TOTP. */
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

const code = (secret: string, timestampMs: number) =>
  TOTP.generate({ secret: Secret.fromBase32(secret), timestamp: timestampMs });

describe('RFC 6238 test vectors', () => {
  it.each(RFC_VECTORS)('the library computes the 8-digit code at T=%i as %s', (seconds, value) => {
    const secret = Secret.fromBase32(RFC_SECRET);
    expect(TOTP.generate({ secret, digits: 8, timestamp: seconds * 1000 })).toBe(value);
  });

  it.each(RFC_VECTORS)(
    'matchTotpStep accepts the 6-digit code at T=%i (%s) for its step',
    (seconds, value) => {
      // A 6-digit code is the 8-digit one mod 10^6: its last six digits.
      expect(matchTotpStep(RFC_SECRET, value.slice(2), seconds * 1000)).toBe(
        Math.floor(seconds / 30),
      );
    },
  );
});

describe('matchTotpStep', () => {
  // Fixed values keep the test deterministic (random ones could share a code by chance).
  const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const now = 1_790_000_000_000;
  const step = Math.floor(now / 30_000);

  it('accepts the current code', () => {
    expect(matchTotpStep(secret, code(secret, now), now)).toBe(step);
  });

  it('accepts the previous and the next code (clock drift) and names their step', () => {
    expect(matchTotpStep(secret, code(secret, now - 30_000), now)).toBe(step - 1);
    expect(matchTotpStep(secret, code(secret, now + 30_000), now)).toBe(step + 1);
  });

  it('refuses codes two steps away', () => {
    for (const offset of [-60_000, 60_000]) {
      expect(matchTotpStep(secret, code(secret, now + offset), now)).toBeNull();
    }
  });

  it('refuses a code of another secret', () => {
    expect(matchTotpStep(secret, code(RFC_SECRET, now), now)).toBeNull();
  });

  it('refuses anything that is not 6 digits', () => {
    const value = code(secret, now);
    for (const input of [
      '',
      value.slice(1),
      `${value}0`,
      ` ${value}`,
      'abcdef',
      `${value.slice(0, 5)}x`,
    ]) {
      expect(matchTotpStep(secret, input, now)).toBeNull();
    }
  });
});

describe('currentTotpCode', () => {
  it('generates the code matchTotpStep accepts right now', () => {
    const secret = generateTotpSecret();
    const now = 1_790_000_000_000;
    const generated = currentTotpCode(secret, now);

    expect(generated).toMatch(/^\d{6}$/);
    expect(matchTotpStep(secret, generated, now)).toBe(Math.floor(now / 30_000));
  });
});

describe('generateTotpSecret', () => {
  it('is 160 random bits in base32', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(Secret.fromBase32(secret).bytes).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(secret);
  });
});

describe('totpUri', () => {
  it('enrolls SHA-1, 6 digits, 30 s under the app issuer', () => {
    const uri = new URL(totpUri(RFC_SECRET, 'superadmin'));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe('/heribertova.do:superadmin');
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      issuer: 'heribertova.do',
      secret: RFC_SECRET,
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
  });
});
