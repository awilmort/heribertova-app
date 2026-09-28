import { describe, expect, it } from 'vitest';
import { outranks, roleSchema, ROLES } from './roles';

describe('roles', () => {
  it('are the five login roles of the architecture, highest first', () => {
    expect(ROLES).toEqual([
      'superadmin',
      'general_coordinator',
      'recinto_coordinator',
      'team_leader',
      'aspiring_leader',
    ]);
  });

  it('exclude plain members, who never log in', () => {
    expect(roleSchema.safeParse('member').success).toBe(false);
  });
});

describe('outranks', () => {
  it('holds for every role above another', () => {
    expect(outranks('superadmin', 'general_coordinator')).toBe(true);
    expect(outranks('general_coordinator', 'recinto_coordinator')).toBe(true);
    expect(outranks('recinto_coordinator', 'team_leader')).toBe(true);
    expect(outranks('team_leader', 'aspiring_leader')).toBe(true);
    expect(outranks('general_coordinator', 'aspiring_leader')).toBe(true);
  });

  it('never holds between peers', () => {
    for (const role of ROLES) expect(outranks(role, role)).toBe(false);
  });

  it('never holds toward a superior', () => {
    expect(outranks('general_coordinator', 'superadmin')).toBe(false);
    expect(outranks('aspiring_leader', 'team_leader')).toBe(false);
    expect(outranks('recinto_coordinator', 'general_coordinator')).toBe(false);
  });

  it('lets no role outrank the superadmin', () => {
    expect(ROLES.some((role) => outranks(role, 'superadmin'))).toBe(false);
  });
});
