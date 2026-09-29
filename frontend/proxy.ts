import { SESSION_COOKIE } from '@heribertova/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { loginRedirectTarget } from '@/lib/auth-gate';
import { buildContentSecurityPolicy } from '@/lib/content-security-policy';

/**
 * Runs before every page request. First, a coarse authentication gate (`loginRedirectTarget`):
 * redirects to /login when the session cookie is absent. Then it issues a per-request CSP nonce
 * (Next.js applies it to its own scripts) and sets baseline security headers.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const redirectTo = loginRedirectTarget(pathname, search, request.cookies.has(SESSION_COOKIE));
  if (redirectTo) return NextResponse.redirect(new URL(redirectTo, request.url));

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export const config = {
  matcher: [
    {
      // Skip the API (answered by Express, which sets its own headers), static assets and prefetches.
      source:
        '/((?!api|_next/static|_next/image|brand|icons|icon.svg|apple-icon.png|manifest.webmanifest).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
