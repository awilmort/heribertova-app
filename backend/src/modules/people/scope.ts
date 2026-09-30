import type { QueryFilter, Types } from 'mongoose';
import { AppError } from '../../lib/errors';
import { UserModel, type User } from '../users/model';
import type { Person, VoterSnapshot } from './model';

/** What scope depends on for a logged-in user. */
export type ScopeUser = Pick<User, 'role' | 'personId' | 'recintoScopes'>;

/** What scope depends on for a person. */
export type ScopedPerson = Pick<Person, 'ancestors'> & {
  voterSnapshot: Pick<VoterSnapshot, 'recintoKey'>;
};

/**
 * The people a user may read and act on (HERIBERTO_ARCHITECTURE.md §6.3), as a filter for queries on
 * `people`:
 * - superadmin, general_coordinator: everyone;
 * - recinto_coordinator: people who vote in one of their `recintoScopes`, plus their own subtree;
 * - team_leader, aspiring_leader: their own subtree (people whose `ancestors` contain them).
 *
 * A user is not in their own subtree. The filter may contain `$or`: combine it with other conditions
 * through `$and` rather than spreading it.
 */
export function scopeFilter(user: ScopeUser): QueryFilter<Person> {
  switch (user.role) {
    case 'superadmin':
    case 'general_coordinator':
      return {};
    case 'recinto_coordinator':
      return {
        $or: [
          { 'voterSnapshot.recintoKey': { $in: user.recintoScopes } },
          { ancestors: user.personId },
        ],
      };
    case 'team_leader':
    case 'aspiring_leader':
      return { ancestors: user.personId };
  }
}

/** Throws 403 FORBIDDEN unless `person` is in the user's scope. Same rules as `scopeFilter`. */
export function assertInScope(user: ScopeUser, person: ScopedPerson): void {
  if (!isInScope(user, person)) {
    throw new AppError(403, 'FORBIDDEN', 'No tiene acceso a esta persona.');
  }
}

/** Whether `person` is in the user's scope, for callers that show less rather than refuse. */
export function isInScope(user: ScopeUser, person: ScopedPerson): boolean {
  switch (user.role) {
    case 'superadmin':
    case 'general_coordinator':
      return true;
    case 'recinto_coordinator':
      return (
        user.recintoScopes.includes(person.voterSnapshot.recintoKey) ||
        isUnder(person, user.personId)
      );
    case 'team_leader':
    case 'aspiring_leader':
      return isUnder(person, user.personId);
  }
}

function isUnder(person: ScopedPerson, personId: Types.ObjectId): boolean {
  return person.ancestors.some((ancestor) => ancestor.equals(personId));
}

/**
 * The superadmin's own `people` record, if one exists — an operator account, not a campaign member,
 * so anywhere people are listed or counted for display (`/equipo`, `/reportes`, the exports module,
 * the general dashboard) excludes it explicitly, on top of whatever `scopeFilter` already allows.
 * At most one exists, backed by `users`' partial unique index on `role: 'superadmin'`.
 */
export async function superadminPersonId(): Promise<Types.ObjectId | null> {
  const superadmin = await UserModel.findOne({ role: 'superadmin' }).select('personId').lean();
  return superadmin?.personId ?? null;
}
