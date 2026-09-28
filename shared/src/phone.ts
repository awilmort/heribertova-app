import { z } from 'zod';

/**
 * Dominican phone numbers: 10 digits, area code 809, 829 or 849 (the country's three NANP codes).
 * The canonical form stored in `people.phone` is the bare 10 digits.
 */
const PHONE_PATTERN = /^(809|829|849)\d{7}$/;

const PHONE_MESSAGE = 'El teléfono debe tener 10 dígitos y empezar por 809, 829 u 849.';

/** Exactly 10 digits with a Dominican area code, unformatted. */
export const phoneSchema = z.string({ error: PHONE_MESSAGE }).regex(PHONE_PATTERN, PHONE_MESSAGE);

/** Removes everything that is not a digit ("(809) 555-1234" → "8095551234"). */
export function phoneDigits(input: string): string {
  return input.replace(/\D/g, '');
}
