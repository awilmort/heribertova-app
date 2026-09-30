import type {
  AgeBand,
  AgeBandBreakdown,
  GeneralDashboardResponse,
  GeneralDashboardSector,
  LeaderDashboardBirthday,
  LeaderDashboardResponse,
  ProgressBucket,
  ProgressDistribution,
} from '@heribertova/shared';
import type { QueryFilter, Types } from 'mongoose';
import { CAMPAIGN_TIME_ZONE, campaignDate, startOfCampaignDay } from '../../lib/campaignDay';
import type { Actor } from '../audit/service';
import { PersonModel, type Person } from '../people/model';
import { scopeFilter } from '../people/scope';
import { LeadershipEventModel } from '../promotions/model';
import { coverageByRecinto } from '../recintos/service';
import { RecintoModel, type Recinto } from '../recintos/model';
import { getPromotionSettings } from '../settings/service';
import { VoterModel, type Voter } from '../voters/model';

/** "MM" of the campaign's current calendar date (America/Santo_Domingo), for the birthdays list. */
function currentMonth(): string {
  return campaignDate(new Date()).slice(5, 7);
}

/**
 * `GET /api/dashboards/leader` (plan 6.2, `/panel`): the caller's own progress — a team leader's
 * `goal` is `teamGoal`, an aspirant's is `autoPromotionThreshold` (both stored settings, plan 6.1).
 * Anyone may call this; a coordinator or a plain member with no direct team simply sees zeros.
 */
export async function getLeaderDashboard(actor: Actor): Promise<LeaderDashboardResponse> {
  const [me, settings] = await Promise.all([
    PersonModel.findById(actor.user.personId).select({ level: 1 }).lean(),
    getPromotionSettings(),
  ]);
  if (!me) throw new Error(`User ${actor.user.id} has no person document`);

  const members = await PersonModel.find({ leaderId: me._id, deletedAt: null })
    .select({ 'voterSnapshot.fullName': 1, 'voterSnapshot.birthDate': 1, photos: 1 })
    .lean();

  const month = currentMonth();
  const birthdaysThisMonth = members
    .filter((member) => member.voterSnapshot.birthDate.slice(5, 7) === month)
    .map((member) => ({
      id: member._id.toHexString(),
      fullName: member.voterSnapshot.fullName,
      day: Number(member.voterSnapshot.birthDate.slice(8, 10)),
    }))
    .sort((a, b) => a.day - b.day);

  const membersMissingCedulaPhoto = members.filter((member) => !member.photos?.cedula).length;

  const nominatedIds = await LeadershipEventModel.distinct('personId', {
    actorUserId: actor.user._id,
    reason: 'nominated',
  });
  const openAspirants = await PersonModel.find({
    _id: { $in: nominatedIds },
    level: 'aspiring_leader',
  })
    .select({ 'voterSnapshot.fullName': 1 })
    .lean();
  const nominatedAspirants = await Promise.all(
    openAspirants.map(async (aspirant) => ({
      id: aspirant._id.toHexString(),
      fullName: aspirant.voterSnapshot.fullName,
      memberCount: await PersonModel.countDocuments({ leaderId: aspirant._id, deletedAt: null }),
    })),
  );

  return {
    level: me.level,
    memberCount: members.length,
    goal: me.level === 'aspiring_leader' ? settings.autoPromotionThreshold : settings.teamGoal,
    nominatedAspirants,
    membersMissingCedulaPhoto,
    birthdaysThisMonth,
  };
}

/** A recinto coordinator's `/dashboards/general` is narrowed to their `recintoScopes`; the
 * superadmin and the general coordinator (the only other roles with `dashboards.general`) see the
 * whole campaign. */
function dashboardRecintoKeys(user: Actor['user']): string[] | null {
  return user.role === 'recinto_coordinator' ? user.recintoScopes : null;
}

/** One cache entry per distinct scope (plan 8.1's 60 s cache, `dashboards/routes.ts`): the
 * superadmin and the general coordinator share the "everyone" entry; a recinto coordinator gets
 * one keyed by their sorted `recintoScopes`, so two coordinators over different recintos never
 * share a stale result. */
export function scopeCacheKey(user: Actor['user']): string {
  const keys = dashboardRecintoKeys(user);
  return keys ? `recintos:${[...keys].sort().join(',')}` : 'all';
}

/** `age <= maxAge` in Mongo arithmetic on a "YYYY-MM-DD" string field (never a Date — same
 * convention `lib/campaignDay.ts#ageOn` uses), bucketed into the fixed age bands (plan 8.1): the
 * padrón has no sex field, so members are compared against voters by age band instead. */
function ageBandExpr(
  birthDateField: string,
  today: { year: number; month: number; day: number },
): Record<string, unknown> {
  const birthYear = { $toInt: { $substrBytes: [`$${birthDateField}`, 0, 4] } };
  const birthMonth = { $toInt: { $substrBytes: [`$${birthDateField}`, 5, 2] } };
  const birthDay = { $toInt: { $substrBytes: [`$${birthDateField}`, 8, 2] } };
  const hadBirthday = {
    $or: [
      { $gt: [today.month, birthMonth] },
      { $and: [{ $eq: [today.month, birthMonth] }, { $gte: [today.day, birthDay] }] },
    ],
  };
  const age = {
    $subtract: [{ $subtract: [today.year, birthYear] }, { $cond: [hadBirthday, 0, 1] }],
  };
  return {
    $switch: {
      branches: [
        { case: { $lte: [age, 25] }, then: '18-25' },
        { case: { $lte: [age, 35] }, then: '26-35' },
        { case: { $lte: [age, 50] }, then: '36-50' },
        { case: { $lte: [age, 65] }, then: '51-65' },
      ],
      default: '65+',
    },
  };
}

function emptyAgeBandBreakdown(): AgeBandBreakdown {
  return {
    '18-25': { voterCount: 0, memberCount: 0 },
    '26-35': { voterCount: 0, memberCount: 0 },
    '36-50': { voterCount: 0, memberCount: 0 },
    '51-65': { voterCount: 0, memberCount: 0 },
    '65+': { voterCount: 0, memberCount: 0 },
  };
}

function emptyProgressDistribution(): ProgressDistribution {
  return { '0-24': 0, '25-49': 0, '50-74': 0, '75-99': 0, '100+': 0 };
}

/** An aspirant is auto-promoted the moment they cross the threshold (plan 6.1's
 * `onMemberCountChanged`), so `'100+'` is only ever reached by a team leader past their goal. */
function progressBucketFor(ratio: number): ProgressBucket {
  if (ratio >= 1) return '100+';
  if (ratio >= 0.75) return '75-99';
  if (ratio >= 0.5) return '50-74';
  if (ratio >= 0.25) return '25-49';
  return '0-24';
}

/** Every campaign day in `[now - (days - 1), now]`, oldest first — the x-axis of the registrations
 * chart, with no gaps even where a day had zero registrations. */
function dayStringsBack(now: Date, days: number): string[] {
  const start = startOfCampaignDay(now).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Array.from({ length: days }, (_, i) =>
    campaignDate(new Date(start - (days - 1 - i) * oneDayMs)),
  );
}

const REGISTRATIONS_WINDOW_DAYS = 30;
const BIRTHDAYS_LIMIT = 20;

interface PersonFacetResult {
  ageBands: { _id: AgeBand; count: number }[];
  registrationsOverTime: { _id: string; count: number }[];
  birthdaysList: LeaderDashboardBirthday[];
  birthdaysCount: { count: number }[];
  leaders: { _id: Types.ObjectId; level: 'aspiring_leader' | 'team_leader' }[];
  total: { count: number }[];
}

/**
 * `GET /api/dashboards/general` (plan 8.1, `/panel/general`): totals, coverage by sector, leader
 * progress distribution, registrations over the last `REGISTRATIONS_WINDOW_DAYS` days, members vs
 * voters by age band, and this month's birthdays — all narrowed to `dashboardRecintoKeys`.
 * `recinto.voterCount` (rebuilt on every applied import, plan 2.1) is the source for every voter
 * total here except the age bands, which need each voter's birth date and so are the one place
 * this reads `voters` directly.
 */
export async function getGeneralDashboard(actor: Actor): Promise<GeneralDashboardResponse> {
  const now = new Date();
  const today = campaignDate(now);
  const todayParts = {
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
    day: Number(today.slice(8, 10)),
  };
  const monthStr = today.slice(5, 7);
  const cutoffDate = new Date(
    startOfCampaignDay(now).getTime() - (REGISTRATIONS_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000,
  );

  const recintoKeys = dashboardRecintoKeys(actor.user);
  const recintoFilter: QueryFilter<Recinto> = recintoKeys ? { _id: { $in: recintoKeys } } : {};
  const voterMatch: QueryFilter<Voter> = recintoKeys
    ? { status: 'active', recintoKey: { $in: recintoKeys } }
    : { status: 'active' };
  // The same scope `/api/people` and `/api/leaders` use — not `dashboardRecintoKeys` alone, which
  // would (for a recinto coordinator) miss their own subtree outside `recintoScopes` and so
  // disagree with those two endpoints on "how many people are in my scope" (plan 8.2's "Done when:
  // reports reconcile with the dashboard"). `recintoKeys`-only scoping stays right for the
  // recinto/voter side just below (coverage, voter totals), which has no "ancestors" concept.
  const personMatch: QueryFilter<Person> = { deletedAt: null, ...scopeFilter(actor.user) };
  const birthdayMatch = {
    $expr: { $eq: [{ $substrBytes: ['$voterSnapshot.birthDate', 5, 2] }, monthStr] },
  };

  const [settings, recintos, coverage, voterAgeRows, [personFacet]] = await Promise.all([
    getPromotionSettings(),
    RecintoModel.find(recintoFilter).select({ sector: 1, voterCount: 1 }).lean(),
    coverageByRecinto(recintoKeys ?? undefined),
    VoterModel.aggregate<{ _id: AgeBand; count: number }>([
      { $match: voterMatch },
      { $group: { _id: ageBandExpr('birthDate', todayParts), count: { $sum: 1 } } },
    ]),
    PersonModel.aggregate<PersonFacetResult>([
      { $match: personMatch },
      {
        $facet: {
          ageBands: [
            {
              $group: {
                _id: ageBandExpr('voterSnapshot.birthDate', todayParts),
                count: { $sum: 1 },
              },
            },
          ],
          registrationsOverTime: [
            { $match: { createdAt: { $gte: cutoffDate } } },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$createdAt',
                    timezone: CAMPAIGN_TIME_ZONE,
                  },
                },
                count: { $sum: 1 },
              },
            },
          ],
          birthdaysList: [
            { $match: birthdayMatch },
            {
              $project: {
                _id: 0,
                id: { $toString: '$_id' },
                fullName: '$voterSnapshot.fullName',
                day: { $toInt: { $substrBytes: ['$voterSnapshot.birthDate', 8, 2] } },
              },
            },
            { $sort: { day: 1 } },
            { $limit: BIRTHDAYS_LIMIT },
          ],
          birthdaysCount: [{ $match: birthdayMatch }, { $count: 'count' }],
          leaders: [
            { $match: { level: { $in: ['aspiring_leader', 'team_leader'] } } },
            { $project: { _id: 1, level: 1 } },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]),
  ]);
  if (!personFacet) throw new Error('Person facet aggregation returned no document');

  const leaderIds = personFacet.leaders.map((leader) => leader._id);
  const memberCounts = leaderIds.length
    ? await PersonModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { leaderId: { $in: leaderIds }, deletedAt: null } },
        { $group: { _id: '$leaderId', count: { $sum: 1 } } },
      ])
    : [];
  const countByLeader = new Map(memberCounts.map((row) => [row._id.toHexString(), row.count]));

  const aspiringLeaders = emptyProgressDistribution();
  const teamLeaders = emptyProgressDistribution();
  let teamsAtGoal = 0;
  for (const leader of personFacet.leaders) {
    const count = countByLeader.get(leader._id.toHexString()) ?? 0;
    const goal =
      leader.level === 'aspiring_leader' ? settings.autoPromotionThreshold : settings.teamGoal;
    const bucket = progressBucketFor(goal > 0 ? count / goal : 0);
    if (leader.level === 'aspiring_leader') {
      aspiringLeaders[bucket] += 1;
    } else {
      teamLeaders[bucket] += 1;
      if (count >= goal) teamsAtGoal += 1;
    }
  }

  const sectors = new Map<string, GeneralDashboardSector>();
  let totalVoters = 0;
  let recintosWithoutMembers = 0;
  for (const recinto of recintos) {
    const stats = coverage.get(recinto._id) ?? {
      memberCount: 0,
      teamLeaderCount: 0,
      aspirantCount: 0,
    };
    totalVoters += recinto.voterCount;
    if (stats.memberCount === 0) recintosWithoutMembers += 1;

    const sector = sectors.get(recinto.sector) ?? {
      sector: recinto.sector,
      voterCount: 0,
      memberCount: 0,
      recintoCount: 0,
      recintosWithoutMembers: 0,
    };
    sector.voterCount += recinto.voterCount;
    sector.memberCount += stats.memberCount;
    sector.recintoCount += 1;
    if (stats.memberCount === 0) sector.recintosWithoutMembers += 1;
    sectors.set(recinto.sector, sector);
  }

  const ageBands = emptyAgeBandBreakdown();
  for (const row of voterAgeRows) ageBands[row._id].voterCount = row.count;
  for (const row of personFacet.ageBands) ageBands[row._id].memberCount = row.count;

  const countsByDay = new Map(personFacet.registrationsOverTime.map((row) => [row._id, row.count]));
  const registrationsOverTime = dayStringsBack(now, REGISTRATIONS_WINDOW_DAYS).map((date) => ({
    date,
    count: countsByDay.get(date) ?? 0,
  }));

  return {
    totals: {
      voters: totalVoters,
      // From the same scoped facet as `leaderProgress`/`teamsAtGoal` above, so this always agrees
      // with `/api/people` and `/api/leaders` (plan 8.2's reports) — not a per-recinto sum, which
      // would silently drop anyone whose `recintoKey` no longer matches a current `recintos` row.
      totalRegistered: personFacet.total[0]?.count ?? 0,
      teamLeaders: personFacet.leaders.filter((leader) => leader.level === 'team_leader').length,
      aspiringLeaders: personFacet.leaders.filter((leader) => leader.level === 'aspiring_leader')
        .length,
      recintos: recintos.length,
      recintosWithoutMembers,
    },
    coverageBySector: [...sectors.values()].sort((a, b) => a.sector.localeCompare(b.sector, 'es')),
    leaderProgress: { aspiringLeaders, teamLeaders },
    teamsAtGoal,
    registrationsOverTime,
    ageBands,
    birthdaysThisMonth: {
      count: personFacet.birthdaysCount[0]?.count ?? 0,
      upcoming: personFacet.birthdaysList,
    },
  };
}
