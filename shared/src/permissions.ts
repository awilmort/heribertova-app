import { z } from 'zod';
import type { Role } from './roles';

/**
 * Every permission a route can require (HERIBERTO_ARCHITECTURE.md §8). Keys are listed even before
 * the route that checks them exists: this list and `ROLE_PERMISSIONS` are the contract `GET /api/me`
 * hands to the web app to build the navigation.
 */
export const PERMISSIONS = [
  'voters.lookup',
  'voters.import',
  'people.create',
  'people.update',
  'people.delete',
  'people.validate',
  'people.export',
  'leaders.nominate',
  'leaders.promoteManual',
  'recintos.viewOwn',
  'recintos.assignCoordinator',
  'users.manage',
  'users.resetPassword',
  'dashboards.general',
  'reports.view',
  'settings.manage',
  'audit.view',
  'backups.manage',
] as const;

export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof permissionSchema>;

/**
 * What each login role may do (HERIBERTO_ARCHITECTURE.md §2, §8). Each role holds every permission
 * of the role below it. Which people a permission reaches (scope) is enforced separately, per role,
 * by the server (`scopeFilter` / `assertInScope`).
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  superadmin: PERMISSIONS,
  general_coordinator: [
    'voters.lookup',
    'people.create',
    'people.update',
    'people.delete',
    'people.validate',
    'people.export',
    'leaders.nominate',
    'leaders.promoteManual',
    'recintos.viewOwn',
    'recintos.assignCoordinator',
    'users.manage',
    'users.resetPassword',
    'dashboards.general',
    'reports.view',
  ],
  recinto_coordinator: [
    'voters.lookup',
    'people.create',
    'people.update',
    'people.delete',
    'people.validate',
    'people.export',
    'leaders.nominate',
    'recintos.viewOwn',
    'users.resetPassword',
    'dashboards.general',
    'reports.view',
  ],
  team_leader: [
    'voters.lookup',
    'people.create',
    'people.update',
    'people.delete',
    'leaders.nominate',
    'recintos.viewOwn',
  ],
  aspiring_leader: [
    'voters.lookup',
    'people.create',
    'people.update',
    'people.delete',
    'recintos.viewOwn',
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
