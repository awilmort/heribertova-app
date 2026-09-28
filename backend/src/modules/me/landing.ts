import type { Role } from '@heribertova/shared';

/**
 * The web page each role starts on (`/inicio` redirects there; HERIBERTO_ARCHITECTURE.md §10):
 * coordinators follow the campaign on the general dashboard, which a recinto coordinator sees for
 * their own recintos; leaders and aspirants track their own team's progress on the leader dashboard.
 */
const LANDING: Readonly<Record<Role, string>> = {
  superadmin: '/panel/general',
  general_coordinator: '/panel/general',
  recinto_coordinator: '/panel/general',
  team_leader: '/panel',
  aspiring_leader: '/panel',
};

export function landingFor(role: Role): string {
  return LANDING[role];
}
