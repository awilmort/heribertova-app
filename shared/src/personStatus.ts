import { z } from 'zod';

/** Follow-up status set by coordinators when validating a member (plan 5.4); null until then. */
export const PERSON_STATUSES = [
  'confirmed',
  'excused',
  'not_contacted',
  'deceased',
  'resigned',
  'sick',
  'inactive',
] as const;
export const personStatusSchema = z.enum(PERSON_STATUSES);
export type PersonStatus = z.infer<typeof personStatusSchema>;

export const DOC_STATUSES = ['pending', 'partial', 'complete'] as const;
export const docStatusSchema = z.enum(DOC_STATUSES);
export type DocStatus = z.infer<typeof docStatusSchema>;
