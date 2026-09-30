import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { TOTP_REVERIFY_TTL_MS } from '../modules/auth/totp';
import { readSessionToken } from '../modules/sessions/cookie';
import { getTotpVerifiedAt } from '../modules/sessions/service';

/**
 * Guards a sensitive action (plan 9.1's voter-file upload) behind a fresh `POST /api/auth/totp/
 * reverify`, on top of the session's own `requireAuth`/`requirePermission`. Runs as a route handler,
 * after those access guards.
 */
export const requireRecentTotp: RequestHandler = async (req, _res, next) => {
  const token = readSessionToken(req);
  const verifiedAt = token ? await getTotpVerifiedAt(token) : null;
  if (!verifiedAt || Date.now() - verifiedAt.getTime() > TOTP_REVERIFY_TTL_MS) {
    throw new AppError(
      401,
      'TOTP_REVERIFICATION_REQUIRED',
      'Escriba de nuevo el código de su aplicación de autenticación para continuar.',
    );
  }
  next();
};
