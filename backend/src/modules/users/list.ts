import type { UserListQuery, UserListResponse } from '@heribertova/shared';
import type { QueryFilter } from 'mongoose';
import { PersonModel } from '../people/model';
import { UserModel, type User } from './model';

/** `GET /api/users` (plan 4.3): every login account, filterable by role, active state and whether
 * it is still on the default password. Restricted to `users.manage` (superadmin, general
 * coordinator), who both see every user, so there is no scope filter here. */
export async function listUsers(query: UserListQuery): Promise<UserListResponse> {
  const filter: QueryFilter<User> = {};
  if (query.role) filter.role = query.role;
  if (query.isActive !== undefined) filter.isActive = query.isActive;
  if (query.usingDefaultPassword !== undefined) {
    filter.usingDefaultPassword = query.usingDefaultPassword;
  }

  const skip = (query.page - 1) * query.pageSize;
  const [users, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize).lean(),
    UserModel.countDocuments(filter),
  ]);

  const people = await PersonModel.find({ _id: { $in: users.map((user) => user.personId) } })
    .select({ voterSnapshot: 1 })
    .lean();
  const personById = new Map(people.map((person) => [person._id.toHexString(), person]));

  const now = new Date();
  return {
    items: users.map((user) => {
      const person = personById.get(user.personId.toHexString());
      return {
        id: user._id.toHexString(),
        username: user.username,
        role: user.role,
        recintoScopes: user.recintoScopes,
        isActive: user.isActive,
        usingDefaultPassword: user.usingDefaultPassword,
        locked: user.lockUntil !== null && user.lockUntil > now,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        person: {
          fullName: person?.voterSnapshot.fullName ?? '—',
          recintoName: person?.voterSnapshot.recintoName ?? '—',
          sector: person?.voterSnapshot.sector ?? '—',
        },
      };
    }),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}
