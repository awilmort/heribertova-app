import type {
  AssignRecintoCoordinatorsRequest,
  RecintoCoordinator,
  RecintoListQuery,
  RecintoListResponse,
  RecintoSummary,
  RecintoVoterItem,
  RecintoVotersQuery,
  RecintoVotersResponse,
} from '@heribertova/shared';
import type { QueryFilter } from 'mongoose';
import { ageOn, campaignDate } from '../../lib/campaignDay';
import { AppError } from '../../lib/errors';
import { escapeRegExp, normalizeForSearch } from '../../lib/text';
import type { Actor } from '../audit/service';
import { PersonModel, type Person } from '../people/model';
import { UserModel } from '../users/model';
import { updateUser } from '../users/service';
import { membershipMapFor } from '../voters/membership';
import { VoterModel, type Voter } from '../voters/model';
import { RecintoModel, type Recinto } from './model';
import { assertRecintoInScope } from './scope';

async function loadRecinto(key: string): Promise<Recinto> {
  const recinto = await RecintoModel.findById(key).lean();
  if (!recinto) throw new AppError(404, 'NOT_FOUND', 'No encontramos ese recinto.');
  return recinto;
}

/** `GET /api/recintos/:key/summary` (plan 7.1, `/mi-recinto`): voters, members, colegios, validated
 * members and leaders for one recinto. */
export async function getRecintoSummary(actor: Actor, key: string): Promise<RecintoSummary> {
  await assertRecintoInScope(actor.user, key);
  const recinto = await loadRecinto(key);

  const [memberCount, validatedMemberCount, leaderCount] = await Promise.all([
    PersonModel.countDocuments({ 'voterSnapshot.recintoKey': key, deletedAt: null }),
    PersonModel.countDocuments({
      'voterSnapshot.recintoKey': key,
      deletedAt: null,
      validatedAt: { $ne: null },
    }),
    PersonModel.countDocuments({
      'voterSnapshot.recintoKey': key,
      deletedAt: null,
      level: { $in: ['aspiring_leader', 'team_leader'] },
    }),
  ]);

  return {
    key: recinto._id,
    name: recinto.name,
    sector: recinto.sector,
    voterCount: recinto.voterCount,
    colegioCount: recinto.colegios.length,
    memberCount,
    validatedMemberCount,
    leaderCount,
  };
}

/**
 * `GET /api/recintos/:key/voters` (plan 7.1): the active voters of one recinto, with membership
 * badges, optionally narrowed to non-members and/or one colegio, `q` a prefix match on the
 * normalized `searchName`. `filter=nonMembers` excludes registered cédulas before paginating (via
 * the small set of the recinto's own registered cédulas), so paging stays a single indexed scan
 * over `voters` either way.
 */
export async function listRecintoVoters(
  actor: Actor,
  key: string,
  query: RecintoVotersQuery,
): Promise<RecintoVotersResponse> {
  await assertRecintoInScope(actor.user, key);
  await loadRecinto(key);

  const conditions: QueryFilter<Voter>[] = [{ recintoKey: key, status: 'active' }];
  if (query.colegio !== undefined) conditions.push({ colegioId: query.colegio });
  if (query.q) {
    conditions.push({ searchName: new RegExp(`^${escapeRegExp(normalizeForSearch(query.q))}`) });
  }
  if (query.filter === 'nonMembers') {
    const registeredCedulas = await PersonModel.distinct('cedula', {
      'voterSnapshot.recintoKey': key,
      deletedAt: null,
    });
    conditions.push({ _id: { $nin: registeredCedulas } });
  }
  const filter: QueryFilter<Voter> =
    conditions.length === 1 ? conditions[0]! : { $and: conditions };

  const skip = (query.page - 1) * query.pageSize;
  const [voters, total] = await Promise.all([
    VoterModel.find(filter).sort({ searchName: 1 }).skip(skip).limit(query.pageSize).lean(),
    VoterModel.countDocuments(filter),
  ]);

  const membershipByCedula =
    query.filter === 'nonMembers'
      ? new Map<string, RecintoVoterItem['membership']>()
      : await membershipMapFor(
          voters.map((voter) => voter._id),
          actor.user,
        );

  const today = campaignDate(new Date());
  return {
    items: voters.map((voter) => ({
      cedula: voter._id,
      fullName: voter.fullName,
      age: ageOn(voter.birthDate, today),
      birthDay: voter.birthDay,
      birthMonth: voter.birthMonth,
      colegioId: voter.colegioId,
      membership: membershipByCedula.get(voter._id) ?? { status: 'none' as const },
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export interface RecintoCoverage {
  memberCount: number;
  teamLeaderCount: number;
  aspirantCount: number;
}

/**
 * Non-deleted member/leader/aspirant counts per recinto, in one aggregation. `recintoKeys` narrows
 * it to a recinto coordinator's scope (plan 8.1's `/dashboards/general`); omitted, it covers every
 * recinto, which is what `listRecintos` below needs.
 */
export async function coverageByRecinto(
  recintoKeys?: string[],
): Promise<Map<string, RecintoCoverage>> {
  const match: QueryFilter<Person> = recintoKeys
    ? { deletedAt: null, 'voterSnapshot.recintoKey': { $in: recintoKeys } }
    : { deletedAt: null };
  const rows = await PersonModel.aggregate<{ _id: string } & RecintoCoverage>([
    { $match: match },
    {
      $group: {
        _id: '$voterSnapshot.recintoKey',
        memberCount: { $sum: 1 },
        teamLeaderCount: { $sum: { $cond: [{ $eq: ['$level', 'team_leader'] }, 1, 0] } },
        aspirantCount: { $sum: { $cond: [{ $eq: ['$level', 'aspiring_leader'] }, 1, 0] } },
      },
    },
  ]);
  return new Map(
    rows.map(({ _id, memberCount, teamLeaderCount, aspirantCount }) => [
      _id,
      { memberCount, teamLeaderCount, aspirantCount },
    ]),
  );
}

/** Every recinto_coordinator's current coverage, keyed by recintoKey: who, from `recintoScopes`. */
async function coordinatorsByRecinto(): Promise<Map<string, RecintoCoordinator[]>> {
  const coordinators = await UserModel.find({ role: 'recinto_coordinator' })
    .select({ personId: 1, recintoScopes: 1 })
    .lean();
  if (coordinators.length === 0) return new Map();

  const people = await PersonModel.find({ _id: { $in: coordinators.map((c) => c.personId) } })
    .select({ 'voterSnapshot.fullName': 1 })
    .lean();
  const nameById = new Map(
    people.map((person) => [person._id.toHexString(), person.voterSnapshot.fullName]),
  );

  const map = new Map<string, RecintoCoordinator[]>();
  for (const coordinator of coordinators) {
    const entry: RecintoCoordinator = {
      id: coordinator._id.toHexString(),
      fullName: nameById.get(coordinator.personId.toHexString()) ?? '—',
    };
    for (const key of coordinator.recintoScopes) {
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
  }
  return map;
}

/**
 * `GET /api/recintos` (plan 7.2, `/recintos`): every recinto with its coverage — members, team
 * leaders, aspirants, and who currently coordinates it. `sector`/`q` narrow the Mongo query;
 * `withoutMembers` filters afterward, since member counts only exist once `coverageByRecinto` has
 * run. Ungated by scope (the route restricts the whole feature to `recintos.assignCoordinator`).
 */
export async function listRecintos(query: RecintoListQuery): Promise<RecintoListResponse> {
  const filter: QueryFilter<Recinto> = {};
  if (query.sector) filter.sector = query.sector;
  if (query.q) filter.name = new RegExp(escapeRegExp(query.q), 'i');

  const [recintos, coverage, coordinators] = await Promise.all([
    RecintoModel.find(filter).sort({ sector: 1, name: 1 }).lean(),
    coverageByRecinto(),
    coordinatorsByRecinto(),
  ]);

  const items = recintos
    .map((recinto) => {
      const stats = coverage.get(recinto._id) ?? {
        memberCount: 0,
        teamLeaderCount: 0,
        aspirantCount: 0,
      };
      return {
        key: recinto._id,
        name: recinto.name,
        sector: recinto.sector,
        voterCount: recinto.voterCount,
        ...stats,
        coordinators: coordinators.get(recinto._id) ?? [],
      };
    })
    .filter((item) => !query.withoutMembers || item.memberCount === 0);

  return { items };
}

/**
 * `PUT /api/recintos/:key/coordinators` (plan 7.2): sets the recinto_coordinators who cover `key`
 * to exactly `coordinatorUserIds`, adding it to `recintoScopes` for anyone newly assigned and
 * removing it for anyone dropped. Each affected user goes through `updateUser` (plan 4.3), so rank
 * checks, recinto validation and the audit entry are the same single implementation either flow
 * uses — this never writes to `users` directly.
 */
export async function assignRecintoCoordinators(
  actor: Actor,
  key: string,
  { coordinatorUserIds }: AssignRecintoCoordinatorsRequest,
): Promise<void> {
  await loadRecinto(key);

  const targetIds = [...new Set(coordinatorUserIds)];
  const targeted = await UserModel.find({ _id: { $in: targetIds }, role: 'recinto_coordinator' });
  if (targeted.length !== targetIds.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
      'body.coordinatorUserIds': ['Hay un coordinador de recinto que no existe.'],
    });
  }

  const current = await UserModel.find({ role: 'recinto_coordinator', recintoScopes: key });
  const targetSet = new Set(targetIds);
  const currentSet = new Set(current.map((user) => user._id.toHexString()));

  const toAdd = targeted.filter((user) => !currentSet.has(user._id.toHexString()));
  const toRemove = current.filter((user) => !targetSet.has(user._id.toHexString()));

  for (const user of toAdd) {
    await updateUser(actor, user._id.toHexString(), {
      recintoScopes: [...new Set([...user.recintoScopes, key])],
    });
  }
  for (const user of toRemove) {
    await updateUser(actor, user._id.toHexString(), {
      recintoScopes: user.recintoScopes.filter((scope) => scope !== key),
    });
  }
}
