import { z } from 'zod';
import { cedulaSchema } from '../cedula';
import { docStatusSchema } from '../personStatus';
import { phoneSchema } from '../phone';
import { createPersonRequestSchema } from './people';

/** The two levels that ever appear in `GET /api/leaders` (plan 6.3) — `member` hasn't been
 * nominated yet, and `coordinator` isn't on this ladder at all (plan 4.3's appointment). Also the
 * `level` filter on `GET /api/exports/people.xlsx` (plan 6.4), which reuses this list rather than
 * declaring its own. */
const LEADER_LEVELS = ['aspiring_leader', 'team_leader'] as const;
export const leaderLevelSchema = z.enum(LEADER_LEVELS);
export type LeaderLevel = z.infer<typeof leaderLevelSchema>;

/** How a `people.level` change happened (HERIBERTO_ARCHITECTURE.md §5, `leadershipEvents.reason`). */
export const LEADERSHIP_EVENT_REASONS = [
  'nominated',
  'auto_threshold',
  'manual',
  'demoted',
] as const;
export const leadershipEventReasonSchema = z.enum(LEADERSHIP_EVENT_REASONS);
export type LeadershipEventReason = z.infer<typeof leadershipEventReasonSchema>;

/**
 * `POST /api/promotions/nominations` (plan 6.1): nominates `nomineeCedula` as an aspiring leader,
 * registering `initialMembers` under them in the same transaction (HERIBERTO_ARCHITECTURE.md §6.2).
 * The real minimum count is the stored `nominationMinInitialMembers` setting, not a literal here.
 * `nomineePhone`/`nomineePhoneWhatsapp` are needed only when the nominee is not already a `people`
 * record — an administrative registration (like appointing a coordinator, plan 4.3), so — unlike
 * `initialMembers`, which are real member registrations — there is no consent checkbox for the
 * nominee themself — so both are optional here; the service requires them only on that path, since
 * the 6.3 UI has nothing to send for an already-registered nominee.
 */
export const nominationRequestSchema = z.object({
  nomineeCedula: cedulaSchema,
  nomineePhone: phoneSchema.optional(),
  nomineePhoneWhatsapp: z.boolean().optional(),
  initialMembers: z.array(createPersonRequestSchema.omit({ leaderId: true })).min(1),
});
export type NominationRequest = z.infer<typeof nominationRequestSchema>;

export const nominationResponseSchema = z.object({ personId: z.string(), userId: z.string() });
export type NominationResponse = z.infer<typeof nominationResponseSchema>;

/** `POST /api/promotions/:personId/promote` and `/demote` (plan 6.1): manual moves always need a
 * reason (HERIBERTO_ARCHITECTURE.md §6.2), kept for the audit trail. */
export const manualPromotionRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Indique el motivo.').max(500),
});
export type ManualPromotionRequest = z.infer<typeof manualPromotionRequestSchema>;

/** How `GET /api/leaders` orders its results: alphabetically (the default), or by `memberCount`,
 * highest first. */
export const LEADER_SORTS = ['name', 'memberCount'] as const;
export const leaderSortSchema = z.enum(LEADER_SORTS);
export type LeaderSort = z.infer<typeof leaderSortSchema>;

/** `GET /api/leaders?level=&q=&sort=` (plan 6.3): defaults to both levels, every leader, name order;
 * scoped like everything else in `people` (`scopeFilter`), so a team leader only ever sees their own
 * subtree. `q` matches `fullName`, same as `GET /api/people`'s own search. */
export const leadersQuerySchema = z.object({
  level: leaderLevelSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: leaderSortSchema.optional(),
});
export type LeadersQuery = z.infer<typeof leadersQuerySchema>;

/** One direct member, for a leader's expandable team on `/lideres`. */
export const leaderTeamMemberSchema = z.object({
  id: z.string(),
  cedula: z.string(),
  fullName: z.string(),
  docStatus: docStatusSchema,
});
export type LeaderTeamMember = z.infer<typeof leaderTeamMemberSchema>;

export const leaderListItemSchema = z.object({
  id: z.string(),
  cedula: z.string(),
  fullName: z.string(),
  level: leaderLevelSchema,
  recintoName: z.string(),
  sector: z.string(),
  memberCount: z.number().int(),
  /** `autoPromotionThreshold` for an aspirant, `teamGoal` for a team leader (plan 6.1's settings). */
  goal: z.number().int(),
  team: z.array(leaderTeamMemberSchema),
});
export type LeaderListItem = z.infer<typeof leaderListItemSchema>;

export const leadersResponseSchema = z.object({ items: z.array(leaderListItemSchema) });
export type LeadersResponse = z.infer<typeof leadersResponseSchema>;
