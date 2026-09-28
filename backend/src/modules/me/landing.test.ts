import { hasPermission, ROLES } from '@heribertova/shared';
import { describe, expect, it } from 'vitest';
import { landingFor } from './landing';

describe('landingFor', () => {
  it('sends coordinators to the general dashboard', () => {
    expect(landingFor('superadmin')).toBe('/panel/general');
    expect(landingFor('general_coordinator')).toBe('/panel/general');
    expect(landingFor('recinto_coordinator')).toBe('/panel/general');
  });

  it('sends leaders and aspirants to the leader dashboard', () => {
    expect(landingFor('team_leader')).toBe('/panel');
    expect(landingFor('aspiring_leader')).toBe('/panel');
  });

  it('only lands a role on the general dashboard if it may see it', () => {
    for (const role of ROLES) {
      if (landingFor(role) === '/panel/general') {
        expect(hasPermission(role, 'dashboards.general')).toBe(true);
      }
    }
  });
});
