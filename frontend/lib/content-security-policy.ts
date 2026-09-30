/**
 * Content-Security-Policy for every page (applied in proxy.ts with a fresh nonce per request).
 *
 * - Scripts: Next.js' own scripts carrying the request nonce ('strict-dynamic' lets them load their
 *   chunks). Development additionally needs 'unsafe-eval' for React's debugging features.
 * - Styles: 'unsafe-inline' because UI primitives set inline styles; style injection is low risk
 *   compared with script injection, which stays locked down.
 * - Later phases extend this deliberately (photo URLs from S3 in 5.2).
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'blob:', 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
