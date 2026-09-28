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
