import type { ApiErrorBody } from '@heribertova/shared';
import type { ErrorRequestHandler, Response } from 'express';
import { AppError } from '../lib/errors';
import type { Logger } from '../lib/logger';

/** Shape of the errors thrown by Express' body parsers (http-errors with a `type`). */
function isBodyParserError(err: unknown): err is { type: string } {
  return (
    typeof err === 'object' && err !== null && typeof (err as { type?: unknown }).type === 'string'
  );
}

function send(res: Response, status: number, error: ApiErrorBody['error']): void {
  res.status(status).json({ error } satisfies ApiErrorBody);
}

/**
 * Last middleware: turns any error into the API error shape. Known errors keep their status and
 * message; anything unexpected is logged and reported as a generic 500 without internal details.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err instanceof AppError) {
      send(res, err.status, {
        code: err.code,
        message: err.message,
        ...(err.fields && { fields: err.fields }),
      });
      return;
    }

    if (isBodyParserError(err) && err.type === 'entity.parse.failed') {
      send(res, 400, {
        code: 'INVALID_JSON',
        message: 'El cuerpo de la solicitud no es un JSON válido.',
      });
      return;
    }

    if (isBodyParserError(err) && err.type === 'entity.too.large') {
      send(res, 413, { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud es demasiado grande.' });
      return;
    }

    (req.log ?? logger).error({ err }, 'Unhandled error');
    send(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. Intente nuevamente.',
    });
  };
}
