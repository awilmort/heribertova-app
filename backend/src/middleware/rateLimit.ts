import type { ApiErrorBody } from '@heribertova/shared';
import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';

const rateLimitedHandler: Options['handler'] = (_req, res) => {
  const body: ApiErrorBody = {
    error: {
      code: 'RATE_LIMITED',
      message: 'Demasiadas solicitudes. Espere un momento e intente nuevamente.',
    },
  };
  res.status(429).json(body);
};

/**
 * Global per-IP limiter. Uses the default in-memory store: the API runs as a single instance
 * (see HERIBERTO_ARCHITECTURE.md §4). Emits standard RateLimit headers (IETF draft 8).
 */
export function globalRateLimit(options: { windowMs: number; max: number }): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: rateLimitedHandler,
  });
}

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Failed logins per client IP + cédula (§12). Runs after body validation, so `body.cedula` is the
 * canonical 11 digits. Successful logins are not counted.
 */
export function loginRateLimit(max: number): RequestHandler {
  return rateLimit({
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const { cedula } = req.body as { cedula: string };
      return `${ipKeyGenerator(req.ip ?? '')}|${cedula}`;
    },
    handler: rateLimitedHandler,
  });
}
