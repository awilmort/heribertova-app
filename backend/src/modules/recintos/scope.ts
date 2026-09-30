import { AppError } from '../../lib/errors';
import { PersonModel } from '../people/model';
import type { ScopeUser } from '../people/scope';

/**
 * Throws 403 FORBIDDEN unless `user` may see recinto `key` (plan 7.1): a team leader or aspirant
 * only their own recinto (their person's `voterSnapshot.recintoKey`); a recinto coordinator only a
 * recinto in `recintoScopes`; a general coordinator or the superadmin, any recinto — the same
 * "everyone" case `scopeFilter` gives those two roles over `people`, applied here to recintos.
 */
export async function assertRecintoInScope(user: ScopeUser, key: string): Promise<void> {
  switch (user.role) {
    case 'superadmin':
    case 'general_coordinator':
      return;
    case 'recinto_coordinator':
      if (!user.recintoScopes.includes(key)) {
        throw new AppError(403, 'FORBIDDEN', 'No tiene acceso a este recinto.');
      }
      return;
    case 'team_leader':
    case 'aspiring_leader': {
      const own = await PersonModel.findById(user.personId)
        .select({ 'voterSnapshot.recintoKey': 1 })
        .lean();
      if (own?.voterSnapshot.recintoKey !== key) {
        throw new AppError(403, 'FORBIDDEN', 'No tiene acceso a este recinto.');
      }
    }
  }
}
