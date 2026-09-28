import { describe, expect, it } from 'vitest';
import { phoneDigits, phoneSchema } from './phone';

describe('phoneSchema', () => {
  it.each(['809', '829', '849'])('accepts 10 digits with area code %s', (code) => {
    expect(phoneSchema.parse(`${code}5551234`)).toBe(`${code}5551234`);
  });

  it.each(['8095551234 ', '809-555-1234', '809555123', '80955512345', '3055551234', '', 'abc'])(
    'rejects %j',
    (value) => {
      const result = phoneSchema.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        'El teléfono debe tener 10 dígitos y empezar por 809, 829 u 849.',
      );
    },
  );
});

describe('phoneDigits', () => {
  it('keeps only the digits', () => {
    expect(phoneDigits('(809) 555-1234')).toBe('8095551234');
    expect(phoneDigits('+1 829.555.1234')).toBe('18295551234');
  });
});
