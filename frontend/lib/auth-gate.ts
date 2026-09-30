/** Routes reachable without a session cookie; everything else redirects to /login. */
const PUBLIC_PATHS = ['/login', '/configuracion-inicial'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Where an unauthenticated request to `pathname` (+ `search`) should be redirected, or null when
 * the route is public or a session cookie is present (`proxy.ts`). This is a coarse,
 * cookie-presence-only gate: it has no database access, so it cannot tell an expired or revoked
 * session from a valid one. That is caught later, by the API answering 401 to client-side requests
 * (`GET /me`), which redirects to /login too.
 */
export function loginRedirectTarget(
  pathname: string,
  search: string,
  hasSessionCookie: boolean,
): string | null {
  if (isPublicPath(pathname) || hasSessionCookie) return null;
  const params = new URLSearchParams({ next: `${pathname}${search}` });
  return `/login?${params.toString()}`;
}
