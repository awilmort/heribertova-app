import type { Permission } from '@heribertova/shared';
import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

/** Every route is served under this prefix (the web app forwards `/api/*` here). */
export const API_PREFIX = '/api';

/**
 * Who may call a route:
 * - `'public'`: anyone, no session needed (health, login, logout);
 * - `'authenticated'`: any logged-in user, whatever the role (their own data, e.g. `/me`);
 * - a `Permission`: logged-in users whose role holds it (`ROLE_PERMISSIONS`).
 * Scope (which people the route reaches) is checked by the handler: `scopeFilter` / `assertInScope`.
 */
export type RouteAccess = 'public' | 'authenticated' | Permission;

/**
 * One API endpoint. Routes are declared as data so that each one must state its access, and the
 * authorization matrix test can walk every route the app serves (`routing/registry.ts`).
 */
export interface ApiRoute {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** Express path under `API_PREFIX`, e.g. `/people/:id`. */
  path: string;
  access: RouteAccess;
  /** Validation, rate limits and the handler itself; they run after the access guards. */
  handlers: RequestHandler[];
}

/** "GET /api/me": how routes are named in errors and in the authorization matrix. */
export function routeId({ method, path }: Pick<ApiRoute, 'method' | 'path'>): string {
  return `${method.toUpperCase()} ${API_PREFIX}${path}`;
}

/** The middleware that enforces a route's access, run before anything else on the route. */
function accessGuards(access: RouteAccess): RequestHandler[] {
  if (access === 'public') return [];
  if (access === 'authenticated') return [requireAuth];
  return [requireAuth, requirePermission(access)];
}

/** Mounts the routes on one router, each behind its access guards. Refuses a route declared twice. */
export function buildApiRouter(routes: readonly ApiRoute[]): Router {
  const router = Router();
  const seen = new Set<string>();
  for (const route of routes) {
    const id = routeId(route);
    if (seen.has(id)) throw new Error(`Route declared twice: ${id}`);
    seen.add(id);
    router[route.method](route.path, ...accessGuards(route.access), ...route.handlers);
  }
  return router;
}
