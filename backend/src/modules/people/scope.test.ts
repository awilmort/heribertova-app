import type { Role } from '@heribertova/shared';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import { useTestDatabase } from '../../../test/database';
import { createTestPerson } from '../../../test/users';
import { PersonModel, type Person } from './model';
import { assertInScope, scopeFilter, type ScopeUser } from './scope';

useTestDatabase();

const registeredBy = new Types.ObjectId();
const R1 = 'liceo-a--centro';
const R2 = 'escuela-primaria-rural--juanillo';
const R3 = 'escuela-primaria-rural--veron';

/**
 * Two teams and a recinto coordinator's own team:
 *
 *   coordinator (R1) ─ leader (R1) ─┬─ member1 (R2)
 *                                   └─ aspirant (R3) ─ member2 (R3)
 *   otherLeader (R2) ─ otherMember (R3)
 *   recintoCoordinator (R3) ─ ownMember (R3)
 */
let tree: Record<
  | 'coordinator'
  | 'leader'
  | 'member1'
  | 'aspirant'
  | 'member2'
  | 'otherLeader'
  | 'otherMember'
  | 'recintoCoordinator'
  | 'ownMember',
  Person
>;

async function person(recintoKey: string, parent?: Person): Promise<Person> {
  const created = await createTestPerson({
    registeredBy,
    voterSnapshot: {
      fullName: 'PERSONA DE PRUEBA',
      recintoKey,
      recintoName: recintoKey.toUpperCase(),
      colegioId: 4675,
      sector: 'CENTRO',
      birthDate: '1990-01-01',
    },
    leaderId: parent?._id ?? null,
    ancestors: parent ? [...parent.ancestors, parent._id] : [],
  });
  return created.toObject();
}

beforeEach(async () => {
  const coordinator = await person(R1);
  const leader = await person(R1, coordinator);
  const aspirant = await person(R3, leader);
  const otherLeader = await person(R2);
  const recintoCoordinator = await person(R3);
  tree = {
    coordinator,
    leader,
    member1: await person(R2, leader),
    aspirant,
    member2: await person(R3, aspirant),
    otherLeader,
    otherMember: await person(R3, otherLeader),
    recintoCoordinator,
    ownMember: await person(R3, recintoCoordinator),
  };
});

type Name = keyof typeof tree;

function userFor(role: Role, name: Name, recintoScopes: string[] = []): ScopeUser {
  return { role, personId: tree[name]._id, recintoScopes };
}

/** Who the filter matches, by name. */
async function matched(user: ScopeUser): Promise<Name[]> {
  const ids = (await PersonModel.find(scopeFilter(user)).select('_id').lean()).map((p) =>
    p._id.toHexString(),
  );
  return namesOf((name) => ids.includes(tree[name]._id.toHexString()));
}

/** Who `assertInScope` admits, by name. */
function admitted(user: ScopeUser): Name[] {
  return namesOf((name) => {
    try {
      assertInScope(user, tree[name]);
      return true;
    } catch {
      return false;
    }
  });
}

function namesOf(predicate: (name: Name) => boolean): Name[] {
  return (Object.keys(tree) as Name[]).filter(predicate).sort();
}

/** The filter and the per-person check must always agree. */
async function scopeOf(user: ScopeUser): Promise<Name[]> {
  const fromFilter = await matched(user);
  expect(admitted(user)).toEqual(fromFilter);
  return fromFilter;
}

const everyone = (): Name[] => namesOf(() => true);

describe('scope', () => {
  it.each(['superadmin', 'general_coordinator'] as const)('gives the %s everyone', async (role) => {
    expect(scopeFilter(userFor(role, 'coordinator'))).toEqual({});
    expect(await scopeOf(userFor(role, 'coordinator'))).toEqual(everyone());
  });

  describe('team leader', () => {
    it('reaches their whole subtree, however deep, but not themselves or anyone above', async () => {
      expect(await scopeOf(userFor('team_leader', 'leader'))).toEqual(
        ['aspirant', 'member1', 'member2'].sort(),
      );
    });

    it('does not reach another team, even in the same recinto', async () => {
      expect(await scopeOf(userFor('team_leader', 'otherLeader'))).toEqual(['otherMember']);
    });

    it('reaches nobody without members', async () => {
      expect(await scopeOf(userFor('team_leader', 'member1'))).toEqual([]);
    });
  });

  describe('aspiring leader', () => {
    it('reaches only their own subtree', async () => {
      expect(await scopeOf(userFor('aspiring_leader', 'aspirant'))).toEqual(['member2']);
    });
  });

  describe('recinto coordinator', () => {
    it('reaches everyone voting in one of their recintos, plus their own subtree', async () => {
      const user = userFor('recinto_coordinator', 'recintoCoordinator', [R1]);
      expect(await scopeOf(user)).toEqual(['coordinator', 'leader', 'ownMember'].sort());
    });

    it('unions several recintos', async () => {
      const user = userFor('recinto_coordinator', 'recintoCoordinator', [R1, R2]);
      expect(await scopeOf(user)).toEqual(
        ['coordinator', 'leader', 'member1', 'otherLeader', 'ownMember'].sort(),
      );
    });

    it('reaches themselves through their recinto, not through their subtree', async () => {
      expect(
        await scopeOf(userFor('recinto_coordinator', 'recintoCoordinator', [R2])),
      ).not.toContain('recintoCoordinator');
      expect(await scopeOf(userFor('recinto_coordinator', 'recintoCoordinator', [R3]))).toContain(
        'recintoCoordinator',
      );
    });

    it('reaches only their own subtree while no recinto is assigned', async () => {
      const user = userFor('recinto_coordinator', 'recintoCoordinator');
      expect(await scopeOf(user)).toEqual(['ownMember']);
    });

    it('reaches every recinto once all are assigned', async () => {
      const user = userFor('recinto_coordinator', 'recintoCoordinator', [R1, R2, R3]);
      expect(await scopeOf(user)).toEqual(everyone());
    });
  });

  it('never depends on scopes set on a role that has none', async () => {
    for (const role of ['team_leader', 'aspiring_leader'] as const) {
      expect(await scopeOf(userFor(role, 'aspirant', [R1, R2, R3]))).toEqual(['member2']);
    }
  });
});

describe('assertInScope', () => {
  it('throws 403 FORBIDDEN out of scope', () => {
    const attempt = () => {
      assertInScope(userFor('team_leader', 'leader'), tree.otherMember);
    };
    expect(attempt).toThrow(AppError);
    expect(attempt).toThrow(expect.objectContaining({ status: 403, code: 'FORBIDDEN' }));
  });

  it('returns quietly in scope', () => {
    expect(() => {
      assertInScope(userFor('team_leader', 'leader'), tree.member2);
    }).not.toThrow();
  });
});
