import { z } from 'zod';

/** Machine-readable error codes returned by the API. Add a code here before using it on either side. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_JSON',
  'PAYLOAD_TOO_LARGE',
  'NOT_FOUND',
  /** Login failed. Deliberately one code for every reason (wrong password, locked, bot check…). */
  'INVALID_CREDENTIALS',
  /** No valid session: never logged in, logged out, expired, or the account was deactivated. */
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Field path (e.g. "body.phone") → messages. */
export const fieldErrorsSchema = z.record(z.string(), z.array(z.string()));
export type FieldErrors = z.infer<typeof fieldErrorsSchema>;

/** Body of every non-2xx API response. */
export const apiErrorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    fields: fieldErrorsSchema.optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
