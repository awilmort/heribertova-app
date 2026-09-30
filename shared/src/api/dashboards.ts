import { z } from 'zod';
import { personLevelSchema } from '../personLevels';

/** One aspirant the caller has nominated, still open (not yet promoted or demoted). */
export const leaderDashboardAspirantSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  memberCount: z.number().int(),
});
export type LeaderDashboardAspirant = z.infer<typeof leaderDashboardAspirantSchema>;

/** One direct member with a birthday this month, day only (year is irrelevant to a birthday list). */
export const leaderDashboardBirthdaySchema = z.object({
  id: z.string(),
  fullName: z.string(),
  day: z.number().int().min(1).max(31),
});
export type LeaderDashboardBirthday = z.infer<typeof leaderDashboardBirthdaySchema>;

/**
 * `GET /api/dashboards/leader` (plan 6.2): the caller's own progress — a team leader's `goal` is
 * `teamGoal`, an aspirant's is `autoPromotionThreshold` (both stored settings, plan 6.1) — plus
 * their open aspirants' progress, how many direct members still lack a cédula photo, and this
 * month's birthdays among direct members.
 */
export const leaderDashboardResponseSchema = z.object({
  level: personLevelSchema,
  memberCount: z.number().int(),
  goal: z.number().int(),
  nominatedAspirants: z.array(leaderDashboardAspirantSchema),
  membersMissingCedulaPhoto: z.number().int(),
  birthdaysThisMonth: z.array(leaderDashboardBirthdaySchema),
});
export type LeaderDashboardResponse = z.infer<typeof leaderDashboardResponseSchema>;

/** The padrón has no sex field (HERIBERTO_ARCHITECTURE.md §2), so `/panel/general` (plan 8.1)
 * compares members against voters by age band instead. Fixed, ascending order; a response always
 * fills in all five, zero counts included. */
export const AGE_BANDS = ['18-25', '26-35', '36-50', '51-65', '65+'] as const;
export const ageBandSchema = z.enum(AGE_BANDS);
export type AgeBand = z.infer<typeof ageBandSchema>;

export const ageBandCountsSchema = z.object({
  voterCount: z.number().int(),
  memberCount: z.number().int(),
});
export type AgeBandCounts = z.infer<typeof ageBandCountsSchema>;

export const ageBandBreakdownSchema = z.object({
  '18-25': ageBandCountsSchema,
  '26-35': ageBandCountsSchema,
  '36-50': ageBandCountsSchema,
  '51-65': ageBandCountsSchema,
  '65+': ageBandCountsSchema,
});
export type AgeBandBreakdown = z.infer<typeof ageBandBreakdownSchema>;

/** A leader or aspirant's progress toward their goal (`teamGoal` / `autoPromotionThreshold`,
 * plan 6.1), bucketed for `/panel/general`'s distribution chart. An aspirant is promoted at 100%
 * (plan 6.1's `onMemberCountChanged`), so `'100+'` is reachable only by a team leader past goal. */
export const PROGRESS_BUCKETS = ['0-24', '25-49', '50-74', '75-99', '100+'] as const;
export const progressBucketSchema = z.enum(PROGRESS_BUCKETS);
export type ProgressBucket = (typeof PROGRESS_BUCKETS)[number];

export const progressDistributionSchema = z.object({
  '0-24': z.number().int(),
  '25-49': z.number().int(),
  '50-74': z.number().int(),
  '75-99': z.number().int(),
  '100+': z.number().int(),
});
export type ProgressDistribution = z.infer<typeof progressDistributionSchema>;

/** One row of `/panel/general`'s sector coverage table (plan 8.1): the sector's active voters,
 * registered members, recintos, and how many of those recintos still have no member. */
export const generalDashboardSectorSchema = z.object({
  sector: z.string(),
  voterCount: z.number().int(),
  memberCount: z.number().int(),
  recintoCount: z.number().int(),
  recintosWithoutMembers: z.number().int(),
});
export type GeneralDashboardSector = z.infer<typeof generalDashboardSectorSchema>;

/** One day of the registrations-over-time chart (plan 8.1), campaign-calendar dates with no gaps —
 * every day in the window appears, zero-filled. */
export const registrationsOverTimePointSchema = z.object({
  date: z.string(),
  count: z.number().int(),
});
export type RegistrationsOverTimePoint = z.infer<typeof registrationsOverTimePointSchema>;

export const generalDashboardTotalsSchema = z.object({
  voters: z.number().int(),
  totalRegistered: z.number().int(),
  teamLeaders: z.number().int(),
  aspiringLeaders: z.number().int(),
  recintos: z.number().int(),
  recintosWithoutMembers: z.number().int(),
});
export type GeneralDashboardTotals = z.infer<typeof generalDashboardTotalsSchema>;

/**
 * `GET /api/dashboards/general` (plan 8.1, `/panel/general`): the general coordinator and
 * superadmin see the whole campaign; a recinto coordinator sees only their `recintoScopes`. Backed
 * by aggregation pipelines cached in memory for 60 s (`dashboards/service.ts`'s `scopeCacheKey`).
 */
export const generalDashboardResponseSchema = z.object({
  totals: generalDashboardTotalsSchema,
  coverageBySector: z.array(generalDashboardSectorSchema),
  leaderProgress: z.object({
    aspiringLeaders: progressDistributionSchema,
    teamLeaders: progressDistributionSchema,
  }),
  teamsAtGoal: z.number().int(),
  registrationsOverTime: z.array(registrationsOverTimePointSchema),
  ageBands: ageBandBreakdownSchema,
  birthdaysThisMonth: z.object({
    count: z.number().int(),
    upcoming: z.array(leaderDashboardBirthdaySchema),
  }),
});
export type GeneralDashboardResponse = z.infer<typeof generalDashboardResponseSchema>;
