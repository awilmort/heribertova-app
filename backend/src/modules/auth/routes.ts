import {
  loginRequestSchema,
  totpVerifyRequestSchema,
  type LoginRequest,
  type TotpRequiredResponse,
  type TotpVerifyRequest,
} from '@heribertova/shared';
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import { AppError } from '../../lib/errors';
import { decryptSecret } from '../../lib/secretBox';
import { matchTotpStep } from '../../lib/totp';
import { currentUser } from '../../middleware/requireAuth';
import { loginRateLimit, totpRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import {
  clearSessionCookie,
  clearTotpChallengeCookie,
  readSessionToken,
  readTotpChallengeToken,
  setSessionCookie,
  setTotpChallengeCookie,
} from '../sessions/cookie';
import { createSession, deleteSession, markTotpVerified } from '../sessions/service';
import type { UserDocument } from '../users/model';
import { authenticate, completeLogin, isLocked, registerFailedAttempt } from './service';
import {
  claimTotpStep,
  pendingEnrollment,
  requiresTotp,
  startTotpChallenge,
  verifyTotpChallenge,
} from './totp';

export interface AuthRoutesOptions {
  /** Failed logins allowed per client IP + cédula (and failed TOTP codes per IP) per 15 minutes. */
  loginRateLimitMax: number;
  /** TOTP_ENC_KEY: decrypts the superadmin's TOTP secret. */
  totpKey: Buffer;
}

/** One answer for every failed login, so it never tells whether a cédula has an account. */
function invalidCredentials(): AppError {
  return new AppError(
    401,
    'INVALID_CREDENTIALS',
    'No pudimos iniciar su sesión. Verifique su cédula y contraseña e intente nuevamente.',
  );
}

/**
 * Completes a login: resets the lockout count and opens a session with a new token. The session the
 * browser already had is dropped, so a session planted before login (fixation) cannot be reused.
 */
async function openSession(req: Request, res: Response, user: UserDocument): Promise<void> {
  const previousToken = readSessionToken(req);
  if (previousToken) await deleteSession(previousToken);
  await completeLogin(user);
  const session = await createSession(user, {
    ip: req.ip ?? null,
    userAgent: req.get('User-Agent') ?? null,
  });
  setSessionCookie(res, session.token, session.maxAgeMs);
  req.log.info({ userId: user.id }, 'Login succeeded');
}

export function createAuthRoutes({
  loginRateLimitMax,
  totpKey,
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
          const { cedula, password } = req.body as LoginRequest;

          const result = await authenticate(cedula, password);
          if (!result.ok) {
            req.log.warn({ reason: result.reason }, 'Login failed');
            throw invalidCredentials();
          }

          if (requiresTotp(result.user)) {
            // No session yet: only a challenge that POST /auth/totp/verify can turn into one.
            const challenge = await startTotpChallenge(result.user);
            setTotpChallengeCookie(res, challenge.token, challenge.maxAgeMs);
            req.log.info({ userId: result.user.id }, 'Password accepted, TOTP code required');

            const pending = pendingEnrollment(result.user, totpKey);
            const enrollment = pending
              ? { secret: pending.secret, qrDataUrl: await QRCode.toDataURL(pending.uri) }
              : undefined;
            res.status(202).json({ totpRequired: true, enrollment } satisfies TotpRequiredResponse);
            return;
          }
          await openSession(req, res, result.user);
          res.status(204).end();
        },
      ],
    },
    {
      method: 'post',
      path: '/auth/totp/verify',
      // Public: the caller has no session yet. The TOTP challenge cookie is what it checks.
      access: 'public',
      handlers: [
        validate({ body: totpVerifyRequestSchema }),
        totpRateLimit(loginRateLimitMax),
        async (req, res) => {
          const token = readTotpChallengeToken(req);
          const result = token
            ? await verifyTotpChallenge(token, (req.body as TotpVerifyRequest).code, totpKey)
            : ({ ok: false, reason: 'no_challenge' } as const);

          if (!result.ok) {
            req.log.warn({ reason: result.reason }, 'TOTP verification failed');
            if (result.reason === 'wrong_code' || result.reason === 'reused_code') {
              throw new AppError(
                401,
                'INVALID_TOTP_CODE',
                'El código no es válido. Escriba el código que muestra ahora su aplicación.',
              );
            }
            clearTotpChallengeCookie(res);
            throw new AppError(
              401,
              'UNAUTHENTICATED',
              'La verificación expiró. Inicie sesión nuevamente.',
            );
          }

          clearTotpChallengeCookie(res);
          await openSession(req, res, result.user);
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
    {
      // The step-up gate for a sensitive action on an already-open session (plan 9.1's voter-file
      // upload): unlike /auth/totp/verify, there is no challenge cookie here, since the caller is
      // already logged in — a fresh code against the account's own secret is all this checks.
      method: 'post',
      path: '/auth/totp/reverify',
      access: 'authenticated',
      handlers: [
        validate({ body: totpVerifyRequestSchema }),
        totpRateLimit(loginRateLimitMax),
        async (req, res) => {
          const user = currentUser(req);
          const now = new Date();
          if (!user.totpSecretEnc || isLocked(user, now)) {
            throw new AppError(403, 'FORBIDDEN', 'No puede verificar el código en este momento.');
          }

          const step = matchTotpStep(
            decryptSecret(totpKey, user.totpSecretEnc),
            (req.body as TotpVerifyRequest).code,
            now.getTime(),
          );
          if (step === null || !(await claimTotpStep(user._id, step))) {
            await registerFailedAttempt(user, now);
            req.log.warn({ userId: user.id }, 'TOTP re-verification failed');
            throw new AppError(
              401,
              'INVALID_TOTP_CODE',
              'El código no es válido. Escriba el código que muestra ahora su aplicación.',
            );
          }

          const token = readSessionToken(req);
          if (token) await markTotpVerified(token);
          res.status(204).end();
        },
      ],
    },
  ];
}
