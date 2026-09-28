import { Writable } from 'node:stream';
import express from 'express';
import { request } from '../../test/http';
import { apiErrorBodySchema } from '@heribertova/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../lib/errors';
import { createLogger } from '../lib/logger';
import { errorHandler } from './errorHandler';

function appThrowing(error: unknown) {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const app = express();
  app.get('/boom', () => {
    throw error;
  });
  app.get('/async-boom', async () => {
    await Promise.resolve();
    throw error;
  });
  app.use(errorHandler(createLogger('info', stream)));
  return { app, output: () => lines.join('') };
}

describe('errorHandler', () => {
  it('passes AppError status, code, message and fields through', async () => {
    const { app } = appThrowing(
      new AppError(422, 'VALIDATION_ERROR', 'Mensaje', { 'body.x': ['malo'] }),
    );
    const res = await request(app).get('/boom');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Mensaje', fields: { 'body.x': ['malo'] } },
    });
  });

  it('omits fields when the AppError has none', async () => {
    const { app } = appThrowing(new AppError(404, 'NOT_FOUND', 'No existe'));
    const res = await request(app).get('/boom');
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No existe' } });
  });

  it('hides unexpected errors behind a generic 500 and logs them', async () => {
    const { app, output } = appThrowing(new Error('database password is hunter2'));
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(output()).toContain('Unhandled error');
  });

  it('handles rejected promises from async handlers (Express 5)', async () => {
    const { app } = appThrowing(new AppError(409, 'VALIDATION_ERROR', 'Conflicto'));
    const res = await request(app).get('/async-boom');
    expect(res.status).toBe(409);
  });
});
