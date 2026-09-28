import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { clearSessionCookie, readSessionToken } from '../modules/sessions/cookie';
import { resolveSession } from '../modules/sessions/service';
import type { UserDocument } from '../modules/users/model';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express types requests through this global namespace.
  namespace Express {
    interface Request {
      /** The logged-in user, set by `requireAuth`. Read it with `currentUser(req)`. */
      user?: UserDocument;
    }
  }
}

/**
 * Admits only requests with a valid session of an active user (401 UNAUTHENTICATED otherwise) and
 * exposes that user to later handlers. A stale cookie is cleared so the browser stops sending it.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = readSessionToken(req);
  const user = token ? await resolveSession(token) : null;
  if (!user) {
    if (token) clearSessionCookie(res);
    throw new AppError(401, 'UNAUTHENTICATED', 'Su sesión expiró. Inicie sesión nuevamente.');
  }
  req.user = user;
  next();
};

/** The user `requireAuth` admitted. Calling it on a route without `requireAuth` is a bug. */
export function currentUser(req: Request): UserDocument {
  if (!req.user) throw new Error('currentUser() called on a route without requireAuth');
  return req.user;
}
