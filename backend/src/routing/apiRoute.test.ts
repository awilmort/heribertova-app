import cookieParser from 'cookie-parser';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { apiErrorBodySchema, type Role } from '@heribertova/shared';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../test/database';
import { sessionCookie } from '../../test/app';
import { createTestUser } from '../../test/users';
import { createLogger } from '../lib/logger';
import { errorHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { createSession } from '../modules/sessions/service';
import { API_PREFIX, buildApiRouter, routeId, type ApiRoute } from './apiRoute';

useTestDatabase();

const ok: RequestHandler = (_req, res) => {
  res.status(204).end();
};

function appWith(routes: ApiRoute[]) {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(API_PREFIX, buildApiRouter(routes));
  app.use(errorHandler(createLogger('silent')));
  return app;
}

const app = appWith([
  { method: 'get', path: '/open', access: 'public', handlers: [ok] },
  { method: 'get', path: '/mine', access: 'authenticated', handlers: [ok] },
  {
    method: 'post',
    path: '/users',
    access: 'users.manage',
    handlers: [validate({ body: z.object({ name: z.string() }) }), ok],
  },
]);

async function tokenFor(role: Role): Promise<string> {
  const user = await createTestUser({ role });
  return (await createSession(user, { ip: null, userAgent: null })).token;
}

function errorCode(res: request.Response) {
  return apiErrorBodySchema.parse(res.body).error.code;
}

describe('buildApiRouter', () => {
  it('serves a public route to anyone', async () => {
    expect((await request(app).get('/api/open')).status).toBe(204);
  });

  it('requires a session on an authenticated route, whatever the role', async () => {
    const anonymous = await request(app).get('/api/mine');
    expect(anonymous.status).toBe(401);
    expect(errorCode(anonymous)).toBe('UNAUTHENTICATED');

    const res = await request(app)
      .get('/api/mine')
      .set('Cookie', sessionCookie(await tokenFor('aspiring_leader')));
    expect(res.status).toBe(204);
  });

  it('requires a session and then the permission on a permission route', async () => {
    const anonymous = await request(app).post('/api/users').send({ name: 'x' });
    expect(errorCode(anonymous)).toBe('UNAUTHENTICATED');

    const allowed = await request(app)
      .post('/api/users')
      .set('Cookie', sessionCookie(await tokenFor('general_coordinator')))
      .send({ name: 'x' });
    expect(allowed.status).toBe(204);
  });

  it('checks access before the route validates anything, so refusals reveal nothing', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', sessionCookie(await tokenFor('team_leader')))
      .send({ invalid: true });
    expect(res.status).toBe(403);
    expect(errorCode(res)).toBe('FORBIDDEN');
  });

  it('refuses a route declared twice', () => {
    const route: ApiRoute = { method: 'get', path: '/open', access: 'public', handlers: [ok] };
    expect(() => buildApiRouter([route, { ...route }])).toThrow(
      'Route declared twice: GET /api/open',
    );
  });

  it('allows the same path under different methods', () => {
    expect(() =>
      buildApiRouter([
        { method: 'get', path: '/open', access: 'public', handlers: [ok] },
        { method: 'post', path: '/open', access: 'public', handlers: [ok] },
      ]),
    ).not.toThrow();
  });
});

describe('routeId', () => {
  it('names a route by method and full path', () => {
    expect(routeId({ method: 'patch', path: '/people/:id' })).toBe('PATCH /api/people/:id');
  });
});
