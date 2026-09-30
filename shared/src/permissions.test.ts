import { describe, expect, it } from 'vitest';
import { hasPermission, permissionSchema, PERMISSIONS, ROLE_PERMISSIONS } from './permissions';
import { ROLES, type Role } from './roles';

describe('PERMISSIONS', () => {
  it('are the keys of architecture §8, each listed once', () => {
    expect([...PERMISSIONS].sort()).toEqual(
      [
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
        'settings.manage',
        'voters.import',
        'audit.view',
        'backups.manage',
      ].sort(),
    );
  });

  it('rejects unknown keys', () => {
    expect(permissionSchema.safeParse('people.read').success).toBe(false);
  });
});

describe('ROLE_PERMISSIONS', () => {
  it('defines every role, with known permissions and no repeats', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      expect(new Set(permissions).size).toBe(permissions.length);
      for (const permission of permissions) expect(PERMISSIONS).toContain(permission);
    }
  });

  it('gives the superadmin every permission', () => {
    expect([...ROLE_PERMISSIONS.superadmin].sort()).toEqual([...PERMISSIONS].sort());
  });

  it.each(['voters.import', 'settings.manage', 'audit.view', 'backups.manage'] as const)(
    'reserves %s to the superadmin',
    (permission) => {
      const holders = ROLES.filter((role) => hasPermission(role, permission));
      expect(holders).toEqual(['superadmin']);
    },
  );

  it('gives each role everything the role below it has, and more', () => {
    for (let i = 0; i < ROLES.length - 1; i++) {
      const higher = ROLE_PERMISSIONS[ROLES[i] as Role];
      const lower = ROLE_PERMISSIONS[ROLES[i + 1] as Role];
      for (const permission of lower) expect(higher).toContain(permission);
      expect(higher.length).toBeGreaterThan(lower.length);
    }
  });

  it('keeps user administration, recinto assignment and manual promotion with the superadmin and general coordinators', () => {
    for (const permission of [
      'users.manage',
      'recintos.assignCoordinator',
      'leaders.promoteManual',
    ] as const) {
      expect(ROLES.filter((role) => hasPermission(role, permission))).toEqual([
        'superadmin',
        'general_coordinator',
      ]);
    }
  });

  it('lets every coordinator validate, export, reset passwords, and see the general dashboard and reports', () => {
    for (const permission of [
      'people.validate',
      'people.export',
      'users.resetPassword',
      'dashboards.general',
      'reports.view',
    ] as const) {
      expect(ROLES.filter((role) => hasPermission(role, permission))).toEqual([
        'superadmin',
        'general_coordinator',
        'recinto_coordinator',
      ]);
    }
  });

  it('lets team leaders nominate aspirants, but not aspirants themselves', () => {
    expect(hasPermission('team_leader', 'leaders.nominate')).toBe(true);
    expect(hasPermission('aspiring_leader', 'leaders.nominate')).toBe(false);
  });

  it('lets every role look up voters, register/edit/delete its members, and see its own recinto', () => {
    for (const role of ROLES) {
      for (const permission of [
        'voters.lookup',
        'people.create',
        'people.update',
        'people.delete',
        'recintos.viewOwn',
      ] as const) {
        expect(hasPermission(role, permission)).toBe(true);
      }
    }
  });
});
