import type { Express } from 'express';
import request from 'supertest';
import { createApp, type AppConfig, type AppDependencies } from '../src/app';
import { createLogger, type Logger } from '../src/lib/logger';
import { SESSION_COOKIE } from '../src/modules/sessions/cookie';

export const TEST_APP_ORIGIN = 'http://localhost:3000';

export const testConfig: AppConfig = {
  TRUST_PROXY: 0,
  RATE_LIMIT_MAX: 1000,
  RATE_LIMIT_WINDOW_MS: 60_000,
  LOGIN_RATE_LIMIT_MAX: 100,
  APP_ORIGIN: TEST_APP_ORIGIN,
};

/** External services stood in: S3 answers and every Turnstile token passes. */
export const testDependencies: AppDependencies = {
  pingS3: () => Promise.resolve(true),
  verifyTurnstile: () => Promise.resolve(true),
};

export function buildTestApp(
  options: {
    config?: Partial<AppConfig>;
    dependencies?: Partial<AppDependencies>;
    logger?: Logger;
  } = {},
): Express {
  return createApp({ ...testConfig, ...options.config }, options.logger ?? createLogger('silent'), {
    ...testDependencies,
    ...options.dependencies,
  });
}

/** The headers the web app's API client sends on state-changing requests (CSRF guard). */
export const sameOriginHeaders = {
  Origin: TEST_APP_ORIGIN,
  'X-Requested-With': 'XMLHttpRequest',
} as const;

/**
 * The `Cookie` header value that carries a session token. Supertest's agent would not replay the
 * `Secure` session cookie over plain http, so tests pass it explicitly.
 */
export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

/** The session token a response set, or undefined. */
export function sessionTokenFrom(res: request.Response): string | undefined {
  const header = res.headers['set-cookie'] as string[] | string | undefined;
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const match = cookies
    .map((cookie) => new RegExp(`^${SESSION_COOKIE}=([^;]*)`).exec(cookie))
    .find(Boolean);
  return match?.[1] || undefined;
}

export function login(app: Express, cedula: string, password: string) {
  return request(app)
    .post('/api/auth/login')
    .set(sameOriginHeaders)
    .send({ cedula, password, turnstileToken: 'test-token' });
}

/** Logs in and returns the session token; fails the test if the login is refused. */
export async function loginToken(app: Express, cedula: string, password: string): Promise<string> {
  const res = await login(app, cedula, password);
  const token = sessionTokenFrom(res);
  if (res.status !== 204 || !token) {
    throw new Error(`Login failed with ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return token;
}
