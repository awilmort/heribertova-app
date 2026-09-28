import { z } from 'zod';

/**
 * Dominican cédula helpers, shared by the backend (voter import, lookups) and the frontend (input mask).
 *
 * A cédula is 11 digits, printed as `000-0000000-0`. The last digit is a mod-10 (Luhn) check digit,
 * but 87 real voters in the Higüey padrón fail it, so a bad check digit is only ever a warning
 * ("verifique la cédula"), never a reason to reject (HERIBERTO_ARCHITECTURE.md §3.1).
 */

export const CEDULA_LENGTH = 11;

const CEDULA_PATTERN = /^\d{11}$/;

const CEDULA_MESSAGE = 'La cédula debe tener 11 dígitos.';

/** Exactly 11 digits, unformatted: the canonical form stored as `voters._id`. */
export const cedulaSchema = z
  .string({ error: CEDULA_MESSAGE })
  .regex(CEDULA_PATTERN, CEDULA_MESSAGE);

/** Removes everything that is not a digit ("001-1234567-2" → "00112345672"). Does not truncate. */
export function cedulaDigits(input: string): string {
  return input.replace(/\D/g, '');
}

/** True when `value` is exactly 11 digits (the canonical form; no dashes or spaces). */
export function isCedula(value: string): boolean {
  return CEDULA_PATTERN.test(value);
}

/**
 * Formats as `000-0000000-0`. Works on partial input too, so it doubles as the input mask:
 * non-digits are dropped, digits beyond the 11th are ignored, and dashes appear as the digits reach
 * them ("0011" → "001-1").
 */
export function formatCedula(input: string): string {
  const digits = cedulaDigits(input).slice(0, CEDULA_LENGTH);
  const parts = [digits.slice(0, 3), digits.slice(3, 10), digits.slice(10)];
  return parts.filter((part) => part.length > 0).join('-');
}

/**
 * The check digit for the first 10 digits of a cédula: Luhn with weights 1,2,1,2… from the left
 * (a doubled digit above 9 counts as the sum of its digits).
 */
export function cedulaCheckDigit(firstTenDigits: string): number {
  if (!/^\d{10}$/.test(firstTenDigits)) {
    throw new Error('cedulaCheckDigit expects exactly 10 digits');
  }
  let sum = 0;
  for (let i = 0; i < firstTenDigits.length; i++) {
    const product = Number(firstTenDigits[i]) * (i % 2 === 0 ? 1 : 2);
    sum += product > 9 ? product - 9 : product;
  }
  return (10 - (sum % 10)) % 10;
}

/** True when `cedula` is 11 digits and its last digit matches the check digit. Informational only. */
export function hasValidCheckDigit(cedula: string): boolean {
  return isCedula(cedula) && cedulaCheckDigit(cedula.slice(0, 10)) === Number(cedula[10]);
}
