import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import type { Logger } from '../lib/logger';
import { maskCedulas } from '../lib/mask';

const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/**
 * Access log + per-request child logger (req.log). The serializers whitelist what is logged:
 * no headers (cookies, auth), no bodies, and cédulas in the URL are masked.
 */
export function requestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: requestId,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: maskCedulas(req.url),
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
