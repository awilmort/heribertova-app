import type { ApiErrorBody } from '@heribertova/shared';
import { rateLimit } from 'express-rate-limit';

/**
 * Global per-IP limiter. Uses the default in-memory store: the API runs as a single instance
 * (see HERIBERTO_ARCHITECTURE.md §4). Emits standard RateLimit headers (IETF draft 8).
 */
export function globalRateLimit(options: { windowMs: number; max: number }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      const body: ApiErrorBody = {
        error: {
          code: 'RATE_LIMITED',
          message: 'Demasiadas solicitudes. Espere un momento e intente nuevamente.',
        },
      };
      res.status(429).json(body);
    },
  });
}
