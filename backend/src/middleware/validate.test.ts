import express from 'express';
import { request } from '../../test/http';
import { apiErrorBodySchema } from '@heribertova/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
import { errorHandler } from './errorHandler';
import { validate } from './validate';

const schemas = {
  params: z.object({ id: z.string().regex(/^\d+$/, 'Debe ser numérico') }),
  query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
  body: z.object({ phone: z.string().min(10, 'Teléfono inválido') }),
};

function appEchoingValidatedRequest() {
  const app = express();
  app.use(express.json());
  app.post('/items/:id', validate(schemas), (req, res) => {
    res.json({ params: req.params, query: req.query, body: req.body as unknown });
  });
  app.use(errorHandler(createLogger('silent')));
  return app;
}

describe('validate', () => {
  it('replaces params, query and body with the parsed values', async () => {
    const res = await request(appEchoingValidatedRequest())
      .post('/items/42?page=3')
      .send({ phone: '8095551234', unexpected: 'dropped' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      params: { id: '42' },
      query: { page: 3 },
      body: { phone: '8095551234' },
    });
  });

  it('applies schema defaults', async () => {
    const res = await request(appEchoingValidatedRequest())
      .post('/items/1')
      .send({ phone: '8095551234' });
    expect(res.body).toMatchObject({ query: { page: 1 } });
  });

  it('reports every invalid field of every part in one 400 response', async () => {
    const res = await request(appEchoingValidatedRequest())
      .post('/items/abc?page=0')
      .send({ phone: '123' });

    expect(res.status).toBe(400);
    const { error } = apiErrorBodySchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(error.fields ?? {}).sort()).toEqual([
      'body.phone',
      'params.id',
      'query.page',
    ]);
    expect(error.fields?.['body.phone']).toEqual(['Teléfono inválido']);
    expect(error.fields?.['params.id']).toEqual(['Debe ser numérico']);
  });

  it('reports a missing body as a validation error', async () => {
    const res = await request(appEchoingValidatedRequest()).post('/items/1');
    expect(res.status).toBe(400);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});
