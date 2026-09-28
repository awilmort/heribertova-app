import express from 'express';
import { request } from '../../test/http';
import { apiErrorBodySchema } from '@heribertova/shared';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../lib/logger';
import { csrfGuard } from './csrf';
import { errorHandler } from './errorHandler';

const APP_ORIGIN = 'https://heribertova.do';

function guardedApp() {
  const app = express();
  app.use(csrfGuard(APP_ORIGIN));
  app.all('/thing', (_req, res) => {
    res.status(204).end();
  });
  app.use(errorHandler(createLogger('silent')));
  return app;
}

const trusted = { Origin: APP_ORIGIN, 'X-Requested-With': 'XMLHttpRequest' };

function expectForbidden(res: request.Response) {
  expect(res.status).toBe(403);
  expect(apiErrorBodySchema.parse(res.body).error.code).toBe('FORBIDDEN');
}

describe('csrfGuard', () => {
  it.each(['get', 'head', 'options'] as const)(
    'lets safe %s requests through untouched',
    async (method) => {
      const res = await request(guardedApp())
        [method]('/thing')
        .set('Origin', 'https://evil.example');
      expect(res.status).toBe(204);
    },
  );

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'accepts %s from the app origin with X-Requested-With',
    async (method) => {
      const res = await request(guardedApp())[method]('/thing').set(trusted);
      expect(res.status).toBe(204);
    },
  );

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'rejects %s from another origin',
    async (method) => {
      expectForbidden(
        await request(guardedApp())
          [method]('/thing')
          .set({ ...trusted, Origin: 'https://evil.example' }),
      );
    },
  );

  it('rejects a lookalike origin (prefix, other scheme or port)', async () => {
    for (const origin of [
      'https://heribertova.do.evil.example',
      'http://heribertova.do',
      'https://heribertova.do:8443',
      'null',
    ]) {
      expectForbidden(
        await request(guardedApp())
          .post('/thing')
          .set({ ...trusted, Origin: origin }),
      );
    }
  });

  it('rejects an unsafe request without an Origin header', async () => {
    expectForbidden(
      await request(guardedApp()).post('/thing').set('X-Requested-With', 'XMLHttpRequest'),
    );
  });

  it('rejects an unsafe request without X-Requested-With (e.g. a plain HTML form)', async () => {
    expectForbidden(await request(guardedApp()).post('/thing').set('Origin', APP_ORIGIN));
  });

  it('rejects an unexpected X-Requested-With value', async () => {
    expectForbidden(
      await request(guardedApp())
        .post('/thing')
        .set({ ...trusted, 'X-Requested-With': 'something-else' }),
    );
  });
});
