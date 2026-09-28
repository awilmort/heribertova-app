import type { FieldErrors } from '@heribertova/shared';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../lib/errors';

type RequestPart = 'params' | 'query' | 'body';
type RequestSchemas = Partial<Record<RequestPart, z.ZodType>>;

const PARTS: readonly RequestPart[] = ['params', 'query', 'body'];

/**
 * Validates request params/query/body against zod schemas. On success the parsed (coerced, stripped)
 * values replace the raw ones, so handlers read typed data from req.params/req.query/req.body.
 * On failure it throws a 400 VALIDATION_ERROR listing messages per field path ("body.phone").
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const fields: FieldErrors = {};
    const parsed: Partial<Record<RequestPart, unknown>> = {};

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        parsed[part] = result.data;
        continue;
      }
      for (const issue of result.error.issues) {
        const key = [part, ...issue.path.map(String)].join('.');
        (fields[key] ??= []).push(issue.message);
      }
    }

    if (Object.keys(fields).length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', fields);
    }

    if ('params' in parsed) req.params = parsed.params as typeof req.params;
    if ('body' in parsed) req.body = parsed.body;
    // Express 5 exposes req.query as a getter; shadow it with the parsed value on this request.
    if ('query' in parsed) {
      Object.defineProperty(req, 'query', {
        value: parsed.query,
        enumerable: true,
        configurable: true,
      });
    }
    next();
  };
}
