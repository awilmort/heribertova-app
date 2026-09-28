import { describe, expect, it } from 'vitest';
import { roleSchema, ROLES } from './roles';

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
