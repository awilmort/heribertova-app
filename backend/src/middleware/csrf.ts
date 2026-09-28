import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The header the web app's API client sends; a cross-site form cannot set it. */
const REQUESTED_WITH_HEADER = 'X-Requested-With';
const REQUESTED_WITH_VALUE = 'XMLHttpRequest';

/**
 * CSRF guard for state-changing requests (HERIBERTO_ARCHITECTURE.md §7), on top of the SameSite=Lax
 * session cookie: the `Origin` header must be the web app's origin (browsers always send it on
 * these requests) and `X-Requested-With` must be present, which forces a CORS preflight that this
 * API never grants to other origins.
 */
export function csrfGuard(appOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    if (
      req.get('Origin') !== appOrigin ||
      req.get(REQUESTED_WITH_HEADER) !== REQUESTED_WITH_VALUE
    ) {
      throw new AppError(403, 'FORBIDDEN', 'Solicitud no permitida.');
    }
    next();
  };
}
