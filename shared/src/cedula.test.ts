import { describe, expect, it } from 'vitest';
import {
  cedulaCheckDigit,
  cedulaDigits,
  cedulaSchema,
  formatCedula,
  hasValidCheckDigit,
  isCedula,
} from './cedula';

// Worked by hand: digits × weights 1,2,1,2…, doubled digits above 9 reduced by 9.
// 0011234567 → 0+0+1+2+2+6+4+(10-9)+6+(14-9) = 27 → check digit 3.
// 4021234567 → 4+0+2+2+2+6+4+1+6+5 = 32 → check digit 8.
const VALID = '00112345673';
const VALID_2 = '40212345678';

describe('cedulaDigits', () => {
  it('strips dashes, spaces and letters', () => {
    expect(cedulaDigits('001-1234567-3')).toBe(VALID);
    expect(cedulaDigits(' 001 1234567 3 ')).toBe(VALID);
    expect(cedulaDigits('abc')).toBe('');
  });

  it('does not truncate extra digits', () => {
    expect(cedulaDigits('0011234567399')).toBe('0011234567399');
  });
});

describe('isCedula', () => {
  it('accepts exactly 11 digits', () => {
    expect(isCedula(VALID)).toBe(true);
    expect(isCedula('00000000000')).toBe(true);
  });

  it('rejects formatted, short, long and non-digit values', () => {
    expect(isCedula('001-1234567-3')).toBe(false);
    expect(isCedula('0011234567')).toBe(false);
    expect(isCedula('001123456733')).toBe(false);
    expect(isCedula('0011234567a')).toBe(false);
    expect(isCedula(' 00112345673')).toBe(false);
    expect(isCedula('')).toBe(false);
  });

  it('accepts a bad check digit (format only)', () => {
    expect(isCedula('00112345670')).toBe(true);
  });
});

describe('cedulaSchema', () => {
  it('parses a canonical cédula', () => {
    expect(cedulaSchema.parse(VALID)).toBe(VALID);
  });

  it('rejects a formatted cédula with a Spanish message', () => {
    const result = cedulaSchema.safeParse('001-1234567-3');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('La cédula debe tener 11 dígitos.');
  });

  it('rejects non-strings with the same message', () => {
    for (const value of [112345673, null, undefined]) {
      const result = cedulaSchema.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('La cédula debe tener 11 dígitos.');
    }
  });
});

describe('formatCedula', () => {
  it('formats a full cédula as 000-0000000-0', () => {
    expect(formatCedula(VALID)).toBe('001-1234567-3');
  });

  it('is idempotent on formatted input', () => {
    expect(formatCedula('001-1234567-3')).toBe('001-1234567-3');
  });

  it('masks partial input progressively', () => {
    expect(formatCedula('')).toBe('');
    expect(formatCedula('0')).toBe('0');
    expect(formatCedula('001')).toBe('001');
    expect(formatCedula('0011')).toBe('001-1');
    expect(formatCedula('0011234567')).toBe('001-1234567');
    expect(formatCedula('00112345673')).toBe('001-1234567-3');
  });

  it('drops non-digits and ignores digits beyond the 11th', () => {
    expect(formatCedula('00a1-12 34567389')).toBe('001-1234567-3');
  });
});

describe('cedulaCheckDigit', () => {
  it('computes the Luhn check digit from the first 10 digits', () => {
    expect(cedulaCheckDigit('0011234567')).toBe(3);
    expect(cedulaCheckDigit('4021234567')).toBe(8);
  });

  it('returns 0 when the weighted sum is a multiple of 10', () => {
    expect(cedulaCheckDigit('0000000000')).toBe(0);
    // 5×1 + 5×2 → 5 + (10-9) = 6; + 4×1 = 10 → 0.
    expect(cedulaCheckDigit('5540000000')).toBe(0);
  });

  it('reduces doubled digits above 9', () => {
    // Only the second digit counts: 9×2 = 18 → 9 → check digit 1.
    expect(cedulaCheckDigit('0900000000')).toBe(1);
  });

  it('throws on anything but 10 digits', () => {
    expect(() => cedulaCheckDigit('001123456')).toThrow('exactly 10 digits');
    expect(() => cedulaCheckDigit('00112345673')).toThrow('exactly 10 digits');
    expect(() => cedulaCheckDigit('001123456a')).toThrow('exactly 10 digits');
  });
});

describe('hasValidCheckDigit', () => {
  it('accepts cédulas whose last digit matches', () => {
    expect(hasValidCheckDigit(VALID)).toBe(true);
    expect(hasValidCheckDigit(VALID_2)).toBe(true);
    expect(hasValidCheckDigit('00000000000')).toBe(true);
  });

  it('flags every other last digit', () => {
    for (let digit = 0; digit <= 9; digit++) {
      if (digit === 3) continue;
      expect(hasValidCheckDigit(`0011234567${digit}`)).toBe(false);
    }
  });

  it('is false for malformed input instead of throwing', () => {
    expect(hasValidCheckDigit('001-1234567-3')).toBe(false);
    expect(hasValidCheckDigit('123')).toBe(false);
    expect(hasValidCheckDigit('')).toBe(false);
  });
});
