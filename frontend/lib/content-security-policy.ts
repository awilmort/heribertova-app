/** The Cloudflare Turnstile widget the login page embeds (plan 3.4). */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * Content-Security-Policy for every page (applied in proxy.ts with a fresh nonce per request).
 *
 * - Scripts: Next.js' own scripts carrying the request nonce ('strict-dynamic' lets them load their
 *   chunks) plus Turnstile's script, loaded with the same nonce via `next/script`; the explicit host
 *   is a fallback for browsers that don't support 'strict-dynamic'. Development additionally needs
 *   'unsafe-eval' for React's debugging features.
 * - Styles: 'unsafe-inline' because UI primitives set inline styles; style injection is low risk
 *   compared with script injection, which stays locked down.
 * - Frames: only Turnstile's own challenge iframe.
 * - Later phases extend this deliberately (photo URLs from S3 in 5.2).
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      TURNSTILE_ORIGIN,
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'blob:', 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'frame-src': [TURNSTILE_ORIGIN],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
