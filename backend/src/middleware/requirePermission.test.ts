import express from 'express';
import request from 'supertest';
import { apiErrorBodySchema, type Role } from '@heribertova/shared';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../lib/logger';
import type { UserDocument } from '../modules/users/model';
import { errorHandler } from './errorHandler';
import { requirePermission } from './requirePermission';

/** An app whose only route needs `users.manage`, called as a user of `role` (as `requireAuth` would set). */
function appAs(role: Role) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { role } as UserDocument;
    next();
  });
  app.get('/thing', requirePermission('users.manage'), (_req, res) => {
    res.status(204).end();
  });
  app.use(errorHandler(createLogger('silent')));
  return app;
}

describe('requirePermission', () => {
  it.each(['superadmin', 'general_coordinator'] as const)(
    'admits a %s, who holds it',
    async (role) => {
      expect((await request(appAs(role)).get('/thing')).status).toBe(204);
    },
  );

  it.each(['recinto_coordinator', 'team_leader', 'aspiring_leader'] as const)(
    'refuses a %s with 403 FORBIDDEN',
    async (role) => {
      const res = await request(appAs(role)).get('/thing');
      expect(res.status).toBe(403);
      expect(apiErrorBodySchema.parse(res.body).error).toEqual({
        code: 'FORBIDDEN',
        message: 'No tiene permiso para realizar esta acción.',
      });
    },
  );

  it('is a bug on a route without requireAuth', async () => {
    const app = express();
    app.get('/thing', requirePermission('users.manage'), (_req, res) => {
      res.status(204).end();
    });
    app.use(errorHandler(createLogger('silent')));
    expect((await request(app).get('/thing')).status).toBe(500);
  });
});
