import request from 'supertest';
import {
  apiErrorBodySchema,
  hasPermission,
  permissionSchema,
  ROLES,
  type Role,
} from '@heribertova/shared';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  buildTestApp,
  sameOriginHeaders,
  sessionCookie,
  testConfig,
  testDependencies,
} from '../../test/app';
import { useTestDatabase } from '../../test/database';
import { createTestLogin, createTestPerson, createTestUser } from '../../test/users';
import type { Person } from '../modules/people/model';
import type { User } from '../modules/users/model';
import { createSession } from '../modules/sessions/service';
import { routeId, type ApiRoute, type RouteAccess } from './apiRoute';
import { apiRoutes } from './registry';

/*
 * The authorization matrix: every route × every caller (anonymous and each role) × a target person
 * in and out of the caller's scope. Expected outcomes follow from the route's declared access,
 * `ROLE_PERMISSIONS` and the route's scope kind, so a route only needs a case below saying how to
 * call it. A route missing from CASES (or a case without a route) fails this file.
 */

useTestDatabase();

type Caller = Record<ApiRoute['method'], (url: string) => request.Test>;

interface MatrixCase {
  /**
   * - `'none'`: the route never looks at another person (health, login, `/me`…).
   * - `'person'`: the route acts on `target` (`assertInScope`): 403 when it is out of scope.
   */
  scope: 'none' | 'person';
  /**
   * Sends the request. Anything but 401 UNAUTHENTICATED / 403 FORBIDDEN / 5xx counts as allowed, so
   * a 400 for a missing body is fine; on a `'person'` route the request must be valid enough to
   * reach the handler's scope check.
   */
  send: (call: Caller, target: MatrixTarget) => request.Test;
}

/**
 * The person a route may act on, with a login of their own: an aspirant, whom every role allowed to
 * act on accounts outranks, so only permission and scope decide the outcome.
 */
interface MatrixTarget {
  person: Person;
  user: User;
}

const CASES: Record<string, MatrixCase> = {
  'GET /api/health': { scope: 'none', send: (call) => call.get('/api/health') },
  'POST /api/auth/login': { scope: 'none', send: (call) => call.post('/api/auth/login').send({}) },
  'POST /api/auth/totp/verify': {
    scope: 'none',
    send: (call) => call.post('/api/auth/totp/verify').send({}),
  },
  'POST /api/auth/logout': { scope: 'none', send: (call) => call.post('/api/auth/logout') },
  'GET /api/me': { scope: 'none', send: (call) => call.get('/api/me') },
  'PUT /api/me/password': { scope: 'none', send: (call) => call.put('/api/me/password').send({}) },
  'POST /api/users/:id/reset-password': {
    scope: 'person',
    send: (call, target) => call.post(`/api/users/${target.user._id.toHexString()}/reset-password`),
  },
};

/** Routes anyone may call without a session. Adding one here is a deliberate, reviewed decision. */
const PUBLIC_ROUTES = [
  'GET /api/health',
  'POST /api/auth/login',
  // The superadmin has no session yet at the TOTP step; the challenge cookie is what it checks.
  'POST /api/auth/totp/verify',
  'POST /api/auth/logout',
];

/** Roles whose scope is everyone (architecture §6.3); every other role is limited. */
const SEES_EVERYONE: readonly Role[] = ['superadmin', 'general_coordinator'];

type Target = 'in scope' | 'out of scope';
type Outcome = 'allowed' | 'UNAUTHENTICATED' | 'FORBIDDEN';

function expectedOutcome(
  access: RouteAccess,
  scope: MatrixCase['scope'],
  role: Role | null,
  target: Target,
): Outcome {
  if (access === 'public') return 'allowed';
  if (!role) return 'UNAUTHENTICATED';
  if (access !== 'authenticated' && !hasPermission(role, access)) return 'FORBIDDEN';
  if (scope === 'person' && target === 'out of scope' && !SEES_EVERYONE.includes(role)) {
    return 'FORBIDDEN';
  }
  return 'allowed';
}

const routes = apiRoutes(testConfig, testDependencies);
const app = buildTestApp();

const IN_RECINTO = 'liceo-juan-pablo-duarte--centro-ciudad';
const OTHER_RECINTO = 'escuela-primaria-rural--juanillo';

function snapshotIn(recintoKey: string): Person['voterSnapshot'] {
  return {
    fullName: 'PERSONA DE PRUEBA',
    recintoKey,
    recintoName: recintoKey.toUpperCase(),
    colegioId: 4675,
    sector: 'CENTRO',
    birthDate: '1990-01-01',
  };
}

function callerFor(token: string | null): Caller {
  const call = (method: ApiRoute['method']) => (url: string) => {
    const req = request(app)[method](url).set(sameOriginHeaders);
    return token ? req.set('Cookie', sessionCookie(token)) : req;
  };
  return {
    get: call('get'),
    post: call('post'),
    put: call('put'),
    patch: call('patch'),
    delete: call('delete'),
  };
}

/**
 * A caller of `role` (null = anonymous) and the targets: in scope is a member of the caller's own
 * team voting in IN_RECINTO, which a recinto coordinator also covers; out of scope is an unrelated
 * person voting in OTHER_RECINTO.
 */
async function world(
  role: Role | null,
): Promise<{ call: Caller; targets: Record<Target, MatrixTarget> }> {
  const outOfScope = await targetPerson({
    registeredBy: new Types.ObjectId(),
    voterSnapshot: snapshotIn(OTHER_RECINTO),
  });
  if (!role) {
    return {
      call: callerFor(null),
      targets: { 'in scope': outOfScope, 'out of scope': outOfScope },
    };
  }
  const user = await createTestUser({
    role,
    recintoScopes: role === 'recinto_coordinator' ? [IN_RECINTO] : [],
  });
  const inScope = await targetPerson({
    registeredBy: user._id,
    voterSnapshot: snapshotIn(IN_RECINTO),
    leaderId: user.personId,
    ancestors: [user.personId],
  });
  const { token } = await createSession(user, { ip: null, userAgent: null });
  return { call: callerFor(token), targets: { 'in scope': inScope, 'out of scope': outOfScope } };
}

async function targetPerson(fields: Parameters<typeof createTestPerson>[0]): Promise<MatrixTarget> {
  const person = await createTestPerson({ ...fields, level: 'aspiring_leader' });
  const user = await createTestLogin(person, { role: 'aspiring_leader' });
  return { person: person.toObject(), user: user.toObject() };
}

/** What the API answered, in the matrix's terms. A server error is never an acceptable outcome. */
function outcomeOf(res: request.Response): string {
  if (res.status >= 500) return `server error ${res.status}`;
  if (res.status === 401 || res.status === 403) {
    const { code } = apiErrorBodySchema.parse(res.body).error;
    if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') return code;
  }
  return 'allowed';
}

/** "METHOD /path" of every route an Express router serves, including routers mounted in it. */
interface RouterLayer {
  route?: { path: string; stack: { method: string }[] };
  handle: unknown;
}

function servedRoutes(stack: RouterLayer[]): string[] {
  return stack.flatMap((layer) => {
    if (layer.route) {
      const { path, stack: handlers } = layer.route;
      return [...new Set(handlers.map((handler) => handler.method))].map(
        (method) => `${method.toUpperCase()} ${path}`,
      );
    }
    const nested = (layer.handle as { stack?: RouterLayer[] }).stack;
    return nested ? servedRoutes(nested) : [];
  });
}

const ids = routes.map(routeId);

describe('route registry', () => {
  it('holds every route the app serves, and the app serves every route it holds', () => {
    const served = servedRoutes((app.router as unknown as { stack: RouterLayer[] }).stack);
    const registered = routes.map((route) => `${route.method.toUpperCase()} ${route.path}`);
    expect(served.sort()).toEqual(registered.sort());
  });

  it.each(ids)('%s declares its access: public, authenticated or a known permission', (id) => {
    const { access } = routes[ids.indexOf(id)] as ApiRoute;
    const declared =
      access === 'public' ||
      access === 'authenticated' ||
      permissionSchema.safeParse(access).success;
    expect(declared).toBe(true);
  });

  it('keeps public exactly the routes meant to be public', () => {
    const publicIds = routes.filter((route) => route.access === 'public').map(routeId);
    expect(publicIds.sort()).toEqual([...PUBLIC_ROUTES].sort());
  });

  it('has a matrix case for every route, and a route for every case', () => {
    expect(Object.keys(CASES).sort()).toEqual([...ids].sort());
  });
});

const TARGETS: readonly Target[] = ['in scope', 'out of scope'];

const matrix = routes.flatMap((route) => {
  const id = routeId(route);
  const matrixCase = CASES[id];
  if (!matrixCase) return []; // Reported by the registry test above.
  return [null, ...ROLES].flatMap((role) => {
    // The target only matters to a logged-in caller on a route that acts on a person.
    const byTarget = role !== null && matrixCase.scope === 'person';
    return (byTarget ? TARGETS : (['out of scope'] as const)).map((target) => ({
      label: [id, role ?? 'anonymous', ...(byTarget ? [target] : [])].join(' · '),
      matrixCase,
      role,
      target,
      expected: expectedOutcome(route.access, matrixCase.scope, role, target),
    }));
  });
});

describe('authorization matrix', () => {
  it.each(matrix)('$label → $expected', async ({ matrixCase, role, target, expected }) => {
    const { call, targets } = await world(role);
    expect(outcomeOf(await matrixCase.send(call, targets[target]))).toBe(expected);
  });
});

describe('expected outcomes', () => {
  it('let anyone call a public route', () => {
    expect(expectedOutcome('public', 'none', null, 'out of scope')).toBe('allowed');
  });

  it('require a session on every other route', () => {
    expect(expectedOutcome('authenticated', 'none', null, 'out of scope')).toBe('UNAUTHENTICATED');
    expect(expectedOutcome('people.update', 'person', null, 'in scope')).toBe('UNAUTHENTICATED');
  });

  it('follow ROLE_PERMISSIONS', () => {
    expect(expectedOutcome('users.manage', 'none', 'recinto_coordinator', 'in scope')).toBe(
      'FORBIDDEN',
    );
    expect(expectedOutcome('users.manage', 'none', 'general_coordinator', 'in scope')).toBe(
      'allowed',
    );
  });

  it('refuse a target out of scope to limited roles only', () => {
    for (const role of ['recinto_coordinator', 'team_leader', 'aspiring_leader'] as const) {
      expect(expectedOutcome('people.update', 'person', role, 'in scope')).toBe('allowed');
      expect(expectedOutcome('people.update', 'person', role, 'out of scope')).toBe('FORBIDDEN');
    }
    for (const role of SEES_EVERYONE) {
      expect(expectedOutcome('people.update', 'person', role, 'out of scope')).toBe('allowed');
    }
  });

  it('ignore the target on routes without scope', () => {
    expect(expectedOutcome('authenticated', 'none', 'aspiring_leader', 'out of scope')).toBe(
      'allowed',
    );
  });
});
