import { z } from 'zod';

/**
 * The login roles (HERIBERTO_ARCHITECTURE.md §2), highest first. Plain members never log in, so
 * `member` is not a role: it only exists as a `people.level`. Roles live in code, not in the database.
 */
export const ROLES = [
  'superadmin',
  'general_coordinator',
  'recinto_coordinator',
  'team_leader',
  'aspiring_leader',
] as const;

export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/**
 * True when `role` ranks strictly above `other` in `ROLES`. Acting on another account (e.g. resetting
 * its password) needs a higher role, so no one can act on a peer, a superior or the superadmin.
 */
export function outranks(role: Role, other: Role): boolean {
  return ROLES.indexOf(role) < ROLES.indexOf(other);
}
