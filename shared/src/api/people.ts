import { z } from 'zod';
import { cedulaSchema } from '../cedula';
import { personLevelSchema } from '../personLevels';
import { docStatusSchema, personStatusSchema } from '../personStatus';
import { phoneSchema } from '../phone';
import { booleanQueryParamSchema, pagedResponseSchema, paginationQuerySchema } from './pagination';

/** The two photo slots a person has (plan 5.2): the cédula photo (required by the UI flow) and an
 * optional selfie. */
export const PHOTO_KINDS = ['cedula', 'selfie'] as const;
export const photoKindSchema = z.enum(PHOTO_KINDS);
export type PhotoKind = z.infer<typeof photoKindSchema>;

/** `POST /api/people/check` (plan 5.1): whether `cedula` can be registered, and the padrón fields
 * to prefill the form with when it can. */
export const checkPersonRequestSchema = z.object({ cedula: cedulaSchema });
export type CheckPersonRequest = z.infer<typeof checkPersonRequestSchema>;

export const checkPersonResponseSchema = z.discriminatedUnion('eligible', [
  z.object({
    eligible: z.literal(true),
    fullName: z.string(),
    recintoKey: z.string(),
    recintoName: z.string(),
    colegioId: z.number().int(),
    sector: z.string(),
    checkDigitValid: z.boolean(),
  }),
  z.object({
    eligible: z.literal(false),
    code: z.enum(['not_a_voter', 'already_registered']),
    reason: z.string(),
    /** The current team leader's name, shown only when the caller's scope reaches them. */
    leaderName: z.string().nullable().optional(),
  }),
]);
export type CheckPersonResponse = z.infer<typeof checkPersonResponseSchema>;

/** `POST /api/people`: registers a member. Re-checks the same eligibility rules server-side. */
export const createPersonRequestSchema = z.object({
  cedula: cedulaSchema,
  nickname: z.string().trim().min(1).max(80).nullable().default(null),
  phone: phoneSchema,
  phoneWhatsapp: z.boolean(),
  phone2: phoneSchema.nullable().default(null),
  phone2Whatsapp: z.boolean().nullable().default(null),
  email: z.string().trim().email().nullable().default(null),
  /** The registering person vouches that this member agreed to be registered (Ley 172-13). */
  consent: z.literal(true, { error: 'Debe confirmar el consentimiento de la persona.' }),
  /** A coordinator may register someone under a leader other than themself. */
  leaderId: z.string().nullable().default(null),
});
export type CreatePersonRequest = z.infer<typeof createPersonRequestSchema>;

export const personSummarySchema = z.object({
  id: z.string(),
  cedula: z.string(),
  fullName: z.string(),
  nickname: z.string().nullable(),
  recintoName: z.string(),
  sector: z.string(),
  level: personLevelSchema,
  status: personStatusSchema.nullable(),
  docStatus: docStatusSchema,
  /** Which of the two photo slots are filled (plan 5.2/5.3): `docStatus` alone can't tell the UI
   * which one is still missing. */
  photos: z.object({ cedula: z.boolean(), selfie: z.boolean() }),
  /** Whether a member avatar has been auto-cropped from the cédula photo (`GET
   * /api/people/:id/avatar`). Separate from `photos`: it's never uploaded directly. */
  hasAvatar: z.boolean(),
  /** True when this member's underlying voter record is `inactive` (plan 9.2): a later padrón cut no
   * longer lists them. The member stays registered; the UI flags it ("ya no figura en el padrón"). */
  voterInactive: z.boolean(),
  createdAt: z.string(),
});
export type PersonSummary = z.infer<typeof personSummarySchema>;

export const personDetailSchema = personSummarySchema.extend({
  phone: z.string(),
  phoneWhatsapp: z.boolean(),
  phone2: z.string().nullable(),
  phone2Whatsapp: z.boolean().nullable(),
  email: z.string().nullable(),
  leaderId: z.string().nullable(),
  recintoKey: z.string(),
  colegioId: z.number().int(),
  /** Set by the "Validar miembro" drawer (plan 5.4) each time a coordinator saves a status. */
  validatedAt: z.string().nullable(),
});
export type PersonDetail = z.infer<typeof personDetailSchema>;

/**
 * How far `GET /api/people` reaches within the caller's scope (`scopeFilter`):
 * - `own`: only people in the caller's own subtree (their `ancestors`) — "/equipo"'s default, since
 *   a coordinator expects "Mi equipo" to mean their own team, not everyone their role can reach;
 * - `all`: the caller's full `scopeFilter` — "Mostrar todo".
 * Omitted, a caller gets `all` (unchanged for `/reportes` and the exports module, which never send
 * this and have always meant the full scope).
 */
export const PERSON_SCOPES = ['own', 'all'] as const;
export const personScopeSchema = z.enum(PERSON_SCOPES);
export type PersonScope = z.infer<typeof personScopeSchema>;

/** `GET /api/people`: scope is the caller's own by default, or their full `scopeFilter` scope with
 * `scope=all`; `q` matches name, cédula or nickname. `sector`/`recintoKey`/`colegioId` and
 * `missingCedulaPhoto` back `/reportes`'s predefined reports (plan 8.2) — `missingCedulaPhoto` is
 * distinct from `docStatus`, since `docStatus: 'partial'` doesn't say *which* of the two photos is
 * missing (`people/photos.ts#docStatusFor`), and the cédula photo is the one the registration flow
 * requires. Either way, the superadmin's own `people` record never appears (`personFilter`).
 */
export const listPeopleQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: personStatusSchema.optional(),
  docStatus: docStatusSchema.optional(),
  sector: z.string().trim().min(1).optional(),
  recintoKey: z.string().trim().min(1).optional(),
  colegioId: z.coerce.number().int().optional(),
  missingCedulaPhoto: booleanQueryParamSchema.optional(),
  scope: personScopeSchema.optional(),
});
export type ListPeopleQuery = z.infer<typeof listPeopleQuerySchema>;

export const listPeopleResponseSchema = pagedResponseSchema(personSummarySchema);
export type ListPeopleResponse = z.infer<typeof listPeopleResponseSchema>;

/** `PATCH /api/people/:id`: contact details anyone with `people.update` may change, plus `status`
 * (plan 5.4's "Validar miembro"), which the server only accepts from a caller who also holds
 * `people.validate` — this schema doesn't know the caller's role, so it can't enforce that itself. */
export const updatePersonRequestSchema = z
  .object({
    nickname: z.string().trim().min(1).max(80).nullable().optional(),
    phone: phoneSchema.optional(),
    phoneWhatsapp: z.boolean().optional(),
    phone2: phoneSchema.nullable().optional(),
    phone2Whatsapp: z.boolean().nullable().optional(),
    email: z.string().trim().email().nullable().optional(),
    status: personStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Debe indicar al menos un cambio.' });
export type UpdatePersonRequest = z.infer<typeof updatePersonRequestSchema>;

/** `DELETE /api/people/:id`: a reason is kept for the audit trail. */
export const deletePersonRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Indique el motivo.').max(500),
});
export type DeletePersonRequest = z.infer<typeof deletePersonRequestSchema>;
