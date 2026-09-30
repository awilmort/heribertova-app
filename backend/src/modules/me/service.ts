import { ROLE_PERMISSIONS, type MeResponse } from '@heribertova/shared';
import { PersonModel } from '../people/model';
import type { UserDocument } from '../users/model';
import { landingFor } from './landing';

/** The logged-in user, the person behind the account, and what their role may do (`GET /api/me`).
 * `permissionsStale` is this call's own read of the flag (plan 6.1/6.2), already consumed by the
 * caller before `role`/`permissions`/`landing` were read here, so those are never stale themselves. */
export async function getMe(user: UserDocument, permissionsStale: boolean): Promise<MeResponse> {
  const person = await PersonModel.findById(user.personId).lean();
  if (!person) throw new Error(`User ${user.id} has no person document`);
  const { voterSnapshot } = person;
  return {
    user: { id: user.id, username: user.username },
    person: {
      id: person._id.toHexString(),
      fullName: voterSnapshot.fullName,
      nickname: person.nickname,
      recintoKey: voterSnapshot.recintoKey,
      recintoName: voterSnapshot.recintoName,
      colegioId: voterSnapshot.colegioId,
      sector: voterSnapshot.sector,
    },
    role: user.role,
    permissions: [...ROLE_PERMISSIONS[user.role]],
    recintoScopes: user.recintoScopes,
    landing: landingFor(user.role),
    usingDefaultPassword: user.usingDefaultPassword,
    permissionsStale,
  };
}
