import type { VoterMembership } from '@heribertova/shared';
import { PersonModel } from '../people/model';
import { isInScope, type ScopeUser } from '../people/scope';

/**
 * Membership status of every cédula in `cedulas` against `people` (plan 2.2's padrón card, plan
 * 7.1's recinto voter list): `none` when nobody registered it, `out_of_scope` when someone did but
 * `user`'s scope doesn't reach them, `member` with the level and team leader's name when it does.
 * Batched so a page of voters costs one `people` query plus one for their leaders' names, not one
 * round trip per voter.
 */
export async function membershipMapFor(
  cedulas: readonly string[],
  user: ScopeUser,
): Promise<Map<string, VoterMembership>> {
  const map = new Map<string, VoterMembership>();
  if (cedulas.length === 0) return map;

  const people = await PersonModel.find({ cedula: { $in: cedulas }, deletedAt: null })
    .select({ cedula: 1, ancestors: 1, voterSnapshot: 1, level: 1, leaderId: 1 })
    .lean();
  const leaderIds = [
    ...new Set(
      people.filter((person) => person.leaderId).map((person) => person.leaderId!.toHexString()),
    ),
  ];
  const leaders = leaderIds.length
    ? await PersonModel.find({ _id: { $in: leaderIds } })
        .select({ 'voterSnapshot.fullName': 1 })
        .lean()
    : [];
  const leaderNameById = new Map(
    leaders.map((leader) => [leader._id.toHexString(), leader.voterSnapshot.fullName]),
  );

  for (const person of people) {
    if (!isInScope(user, person)) {
      map.set(person.cedula, { status: 'out_of_scope' });
      continue;
    }
    map.set(person.cedula, {
      status: 'member',
      level: person.level,
      leaderName: person.leaderId
        ? (leaderNameById.get(person.leaderId.toHexString()) ?? null)
        : null,
    });
  }
  return map;
}

/** The membership of a single cédula; `{status:'none'}` when nobody registered it. */
export async function membershipOf(cedula: string, user: ScopeUser): Promise<VoterMembership> {
  return (await membershipMapFor([cedula], user)).get(cedula) ?? { status: 'none' };
}
