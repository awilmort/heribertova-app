import { describe, expect, it } from 'vitest';
import { defaultPassword, isBirthDatePassword } from './defaultPassword';

describe('defaultPassword', () => {
  it('is the birth date as DDMMYYYY', () => {
    expect(defaultPassword('1985-03-15')).toBe('15031985');
    expect(defaultPassword('2000-12-01')).toBe('01122000');
  });

  it('keeps leading zeros of the day and month', () => {
    expect(defaultPassword('1970-01-09')).toBe('09011970');
  });

  it('keeps the calendar date whatever the time zone (no Date involved)', () => {
    // As a Date, "2000-01-01" is midnight UTC: 31 December 1999 in Higüey (UTC−4).
    expect(defaultPassword('2000-01-01')).toBe('01012000');
  });

  it.each(['15/03/1985', '1985-3-15', '19850315', '', '1985-03-15T00:00:00Z', ' 1985-03-15'])(
    'refuses %j, which is not a "YYYY-MM-DD" string',
    (value) => {
      expect(() => defaultPassword(value)).toThrow('Birth date is not a "YYYY-MM-DD" string');
    },
  );

  it('keeps the birth date out of the error message', () => {
    expect(() => defaultPassword('15/03/1985')).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('1985') as string }),
    );
  });
});

describe('isBirthDatePassword', () => {
  const birthDate = '1985-03-15';

  it.each([
    '15031985',
    '15/03/1985',
    '15-03-1985',
    '15.03.1985',
    '15 03 1985',
    '19850315',
    '1985-03-15',
    '1985/03/15',
  ])('recognises %j as the birth date', (password) => {
    expect(isBirthDatePassword(password, birthDate)).toBe(true);
  });

  it.each(['15031986', '16031985', '03151985', '15031985a', 'clave15031985', 'mi-clave-segura'])(
    'accepts %j, which is not the birth date',
    (password) => {
      expect(isBirthDatePassword(password, birthDate)).toBe(false);
    },
  );
});
