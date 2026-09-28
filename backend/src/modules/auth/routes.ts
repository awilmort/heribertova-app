import { loginRequestSchema, type LoginRequest } from '@heribertova/shared';
import { AppError } from '../../lib/errors';
import { loginRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '../sessions/cookie';
import { createSession, deleteSession } from '../sessions/service';
import { authenticate } from './service';
import type { TurnstileVerifier } from './turnstile';

export interface AuthRoutesOptions {
  verifyTurnstile: TurnstileVerifier;
  /** Failed logins allowed per client IP + cédula per 15 minutes. */
  loginRateLimitMax: number;
}

/** One answer for every failed login, so it never tells whether a cédula has an account. */
function invalidCredentials(): AppError {
  return new AppError(
    401,
    'INVALID_CREDENTIALS',
    'No pudimos iniciar su sesión. Verifique su cédula y contraseña e intente nuevamente.',
  );
}

export function createAuthRoutes({
  verifyTurnstile,
  loginRateLimitMax,
}: AuthRoutesOptions): ApiRoute[] {
  return [
    {
      method: 'post',
      path: '/auth/login',
      access: 'public',
      handlers: [
        validate({ body: loginRequestSchema }),
        loginRateLimit(loginRateLimitMax),
        async (req, res) => {
          const { cedula, password, turnstileToken } = req.body as LoginRequest;

          // The bot check comes first, so bots never reach password hashing or the lockout counters.
          if (!(await verifyTurnstile(turnstileToken, req.ip))) {
            req.log.warn({ reason: 'turnstile' }, 'Login failed');
            throw invalidCredentials();
          }
          const result = await authenticate(cedula, password);
          if (!result.ok) {
            req.log.warn({ reason: result.reason }, 'Login failed');
            throw invalidCredentials();
          }

          // A new token on every login: a session planted before login (fixation) is dropped.
          const previousToken = readSessionToken(req);
          if (previousToken) await deleteSession(previousToken);
          const session = await createSession(result.user, {
            ip: req.ip ?? null,
            userAgent: req.get('User-Agent') ?? null,
          });
          setSessionCookie(res, session.token, session.maxAgeMs);
          req.log.info({ userId: result.user.id }, 'Login succeeded');
          res.status(204).end();
        },
      ],
    },
    {
      method: 'post',
      path: '/auth/logout',
      // Works without a valid session, so a stale cookie can always be cleared.
      access: 'public',
      handlers: [
        async (req, res) => {
          const token = readSessionToken(req);
          if (token) await deleteSession(token);
          clearSessionCookie(res);
          res.status(204).end();
        },
      ],
    },
  ];
}
