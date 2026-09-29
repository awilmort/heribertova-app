/**
 * The session cookie's name, shared so the frontend can check for its mere presence (`proxy.ts`,
 * a coarse gate with no database access) while the backend validates it (`sessions/cookie.ts`).
 */
export const SESSION_COOKIE = '__Host-sid';
