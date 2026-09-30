import { z } from 'zod';
import { booleanQueryParamSchema, pagedResponseSchema, paginationQuerySchema } from './pagination';
import { voterMembershipSchema } from './voters';

/**
 * `GET /api/recintos/:key/summary` (plan 7.1, `/mi-recinto`): headline counts for one recinto. Scope
 * is enforced the same way as `GET /api/recintos/:key/voters` below — a team leader or aspirant only
 * their own recinto, a recinto coordinator only a recinto in their `recintoScopes`.
 */
export const recintoSummarySchema = z.object({
  key: z.string(),
  name: z.string(),
  sector: z.string(),
  voterCount: z.number().int(),
  colegioCount: z.number().int(),
  memberCount: z.number().int(),
  validatedMemberCount: z.number().int(),
  leaderCount: z.number().int(),
});
export type RecintoSummary = z.infer<typeof recintoSummarySchema>;

const RECINTO_VOTER_FILTERS = ['all', 'nonMembers'] as const;
export const recintoVoterFilterSchema = z.enum(RECINTO_VOTER_FILTERS);
export type RecintoVoterFilter = z.infer<typeof recintoVoterFilterSchema>;

/** `GET /api/recintos/:key/voters`: `q` is a prefix match on the voter's normalized `searchName`
 * (accent-insensitive, e.g. "nunez" matches "NUÑEZ"), same normalization as the voter file import. */
export const recintoVotersQuerySchema = paginationQuerySchema.extend({
  filter: recintoVoterFilterSchema.default('all'),
  colegio: z.coerce.number().int().optional(),
  q: z.string().trim().min(1).max(100).optional(),
});
export type RecintoVotersQuery = z.infer<typeof recintoVotersQuerySchema>;

export const recintoVoterItemSchema = z.object({
  cedula: z.string(),
  fullName: z.string(),
  age: z.number().int(),
  birthDay: z.number().int().min(1).max(31),
  birthMonth: z.number().int().min(1).max(12),
  colegioId: z.number().int(),
  /** `{status:'none'}` for every item when `filter=nonMembers`, since that filter already excludes
   * everyone else. */
  membership: voterMembershipSchema,
});
export type RecintoVoterItem = z.infer<typeof recintoVoterItemSchema>;

export const recintoVotersResponseSchema = pagedResponseSchema(recintoVoterItemSchema);
export type RecintoVotersResponse = z.infer<typeof recintoVotersResponseSchema>;

/** `GET /api/recintos` (plan 7.2, `/recintos`): coverage metrics for every recinto, restricted to
 * `recintos.assignCoordinator` (superadmin, general coordinator) — the same roles who may then act
 * on the "assign/unassign coordinators" table this feeds. Not paginated: 110 recintos is small
 * enough to sort and filter entirely on the client. */
export const recintoListQuerySchema = z.object({
  sector: z.string().trim().min(1).optional(),
  withoutMembers: booleanQueryParamSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
});
export type RecintoListQuery = z.infer<typeof recintoListQuerySchema>;

export const recintoCoordinatorSchema = z.object({ id: z.string(), fullName: z.string() });
export type RecintoCoordinator = z.infer<typeof recintoCoordinatorSchema>;

export const recintoCoverageItemSchema = z.object({
  key: z.string(),
  name: z.string(),
  sector: z.string(),
  voterCount: z.number().int(),
  memberCount: z.number().int(),
  teamLeaderCount: z.number().int(),
  aspirantCount: z.number().int(),
  /** The recinto_coordinators whose `recintoScopes` currently include this recinto. */
  coordinators: z.array(recintoCoordinatorSchema),
});
export type RecintoCoverageItem = z.infer<typeof recintoCoverageItemSchema>;

export const recintoListResponseSchema = z.object({ items: z.array(recintoCoverageItemSchema) });
export type RecintoListResponse = z.infer<typeof recintoListResponseSchema>;

/** `PUT /api/recintos/:key/coordinators` (plan 7.2): the full set of recinto_coordinator users who
 * should cover this recinto — replaces, like `PATCH /api/users/:id`'s `recintoScopes` does for one
 * user at a time. Adds the key to each new coordinator's `recintoScopes` and removes it from anyone
 * dropped, reusing `updateUser` (plan 4.3) for each affected user rather than a parallel code path. */
export const assignRecintoCoordinatorsRequestSchema = z.object({
  coordinatorUserIds: z.array(z.string()),
});
export type AssignRecintoCoordinatorsRequest = z.infer<
  typeof assignRecintoCoordinatorsRequestSchema
>;
