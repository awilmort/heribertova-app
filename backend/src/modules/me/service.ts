import { ROLE_PERMISSIONS, type MeResponse } from '@heribertova/shared';
import { PersonModel } from '../people/model';
import type { UserDocument } from '../users/model';
import { landingFor } from './landing';

/** The logged-in user, the person behind the account, and what their role may do (`GET /api/me`). */
export async function getMe(user: UserDocument): Promise<MeResponse> {
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
    landing: landingFor(user.role),
    usingDefaultPassword: user.usingDefaultPassword,
  };
}
