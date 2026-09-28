/**
 * The default password is the birth date as DDMMYYYY (HERIBERTO_ARCHITECTURE.md §7). It is built
 * from the voter's "YYYY-MM-DD" string by rearranging digits, never through a `Date`: a date parsed
 * as midnight UTC and read in the Dominican Republic (UTC−4) falls on the previous day.
 */

const BIRTH_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface BirthDateParts {
  year: string;
  month: string;
  day: string;
}

function birthDateParts(birthDate: string): BirthDateParts {
  const match = BIRTH_DATE.exec(birthDate);
  // The value is personal data: it stays out of the error message (and so out of the logs).
  if (!match) throw new Error('Birth date is not a "YYYY-MM-DD" string');
  const [, year = '', month = '', day = ''] = match;
  return { year, month, day };
}

/** "1985-03-15" → "15031985". */
export function defaultPassword(birthDate: string): string {
  const { year, month, day } = birthDateParts(birthDate);
  return `${day}${month}${year}`;
}

/** Separators people type inside a date: "15/03/1985", "15-03-1985", "15.03.1985", "15 03 1985". */
const DATE_SEPARATORS = /[\s./-]/g;

/**
 * True when `password` is the birth date written as day-month-year (the default password) or
 * year-month-day, with or without separators. Such a password is as guessable as the default.
 */
export function isBirthDatePassword(password: string, birthDate: string): boolean {
  const { year, month, day } = birthDateParts(birthDate);
  const digits = password.replace(DATE_SEPARATORS, '');
  return digits === `${day}${month}${year}` || digits === `${year}${month}${day}`;
}
