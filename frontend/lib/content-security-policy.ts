/**
 * Content-Security-Policy for every page (applied in proxy.ts with a fresh nonce per request).
 *
 * - Scripts: Next.js' own scripts carrying the request nonce ('strict-dynamic' lets them load their
 *   chunks). Development additionally needs 'unsafe-eval' for React's debugging features.
 * - Styles: 'unsafe-inline' because UI primitives set inline styles; style injection is low risk
 *   compared with script injection, which stays locked down.
 * - img-src and connect-src both allow the media/imports bucket host: photo `<img>` tags (plan 5.2)
 *   and `/admin/padron` (plan 9.1) both resolve to a presigned S3 URL that the browser loads or PUTs
 *   to directly — the local MinIO emulator in dev, AWS S3 in production (`us-east-2`, the region the
 *   buckets actually live in — HERIBERTO_ARCHITECTURE.md).
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const s3Host = isDev ? 'http://localhost:9000' : 'https://*.s3.us-east-2.amazonaws.com';
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'blob:', 'data:', s3Host],
    'font-src': ["'self'"],
    'connect-src': ["'self'", s3Host],
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
