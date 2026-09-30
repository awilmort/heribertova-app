import type { Express } from 'express';
import { request } from './http';
import { createApp, type AppConfig, type AppDependencies } from '../src/app';
import { createLogger, type Logger } from '../src/lib/logger';
import { SESSION_COOKIE, TOTP_CHALLENGE_COOKIE } from '../src/modules/sessions/cookie';
import { InMemoryObjectStorage } from './objectStorage';
import { TEST_TOTP_KEY, totpCodeAt } from './totp';

export const TEST_APP_ORIGIN = 'http://localhost:3000';

export const testConfig: AppConfig = {
  TRUST_PROXY: 0,
  RATE_LIMIT_MAX: 1000,
  RATE_LIMIT_WINDOW_MS: 60_000,
  LOGIN_RATE_LIMIT_MAX: 100,
  VOTER_LOOKUP_DAILY_QUOTA: 300,
  EXPORTS_DAILY_QUOTA: 300,
  APP_ORIGIN: TEST_APP_ORIGIN,
  TOTP_ENC_KEY: TEST_TOTP_KEY,
};

/** External services stood in: S3 answers, and photos land in memory instead of a real bucket. */
export const testDependencies: AppDependencies = {
  pingS3: () => Promise.resolve(true),
  objectStorage: new InMemoryObjectStorage(),
  importsObjectStorage: new InMemoryObjectStorage(),
  backupObjectStorage: new InMemoryObjectStorage(),
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

/** The `Cookie` header value that carries a TOTP challenge token (see `sessionCookie`). */
export function totpChallengeCookie(token: string): string {
  return `${TOTP_CHALLENGE_COOKIE}=${token}`;
}

/** The token a response set in cookie `name`, or undefined (also when it cleared the cookie). */
function cookieTokenFrom(res: request.Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as string[] | string | undefined;
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const match = cookies.map((cookie) => new RegExp(`^${name}=([^;]*)`).exec(cookie)).find(Boolean);
  return match?.[1] || undefined;
}

/** The session token a response set, or undefined. */
export function sessionTokenFrom(res: request.Response): string | undefined {
  return cookieTokenFrom(res, SESSION_COOKIE);
}

/** The TOTP challenge token a response set, or undefined. */
export function totpChallengeTokenFrom(res: request.Response): string | undefined {
  return cookieTokenFrom(res, TOTP_CHALLENGE_COOKIE);
}

export function login(app: Express, cedula: string, password: string) {
  return request(app).post('/api/auth/login').set(sameOriginHeaders).send({ cedula, password });
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

/** The superadmin's second login step: `code` against the challenge behind `challengeToken`. */
export function verifyTotp(app: Express, challengeToken: string | null, code: string) {
  const req = request(app).post('/api/auth/totp/verify').set(sameOriginHeaders).send({ code });
  return challengeToken ? req.set('Cookie', totpChallengeCookie(challengeToken)) : req;
}

/** The superadmin's password step; returns the TOTP challenge token, failing the test otherwise. */
export async function superadminChallengeToken(
  app: Express,
  cedula: string,
  password: string,
): Promise<string> {
  const res = await login(app, cedula, password);
  const token = totpChallengeTokenFrom(res);
  if (res.status !== 202 || !token) {
    throw new Error(`Password step failed with ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return token;
}

/**
 * Both login steps of a test superadmin (password, then the current code of TEST_TOTP_SECRET) and
 * returns the session token. A code is accepted once, so call it at most once per 30-second step.
 */
export async function superadminLoginToken(
  app: Express,
  cedula: string,
  password: string,
): Promise<string> {
  const challenge = await superadminChallengeToken(app, cedula, password);
  const res = await verifyTotp(app, challenge, totpCodeAt());
  const token = sessionTokenFrom(res);
  if (res.status !== 204 || !token) {
    throw new Error(`TOTP step failed with ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return token;
}
