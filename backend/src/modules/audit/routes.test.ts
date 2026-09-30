import { request } from '../../../test/http';
import { apiErrorBodySchema, auditLogResponseSchema } from '@heribertova/shared';
import { describe, expect, it } from 'vitest';
import { buildTestApp, sessionCookie } from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { createTestUser, type TestUserOptions } from '../../../test/users';
import { createSession } from '../sessions/service';

useTestDatabase();

const app = buildTestApp();

async function tokenFor(options: TestUserOptions): Promise<string> {
  const user = await createTestUser(options);
  const { token } = await createSession(user, { ip: null, userAgent: null });
  return token;
}

function get(token: string | null, query = '') {
  const req = request(app).get(`/api/audit${query}`);
  return token ? req.set('Cookie', sessionCookie(token)) : req;
}

describe('GET /api/audit', () => {
  it('answers a paginated, empty page when there is nothing logged yet', async () => {
    const token = await tokenFor({ role: 'superadmin' });
    const res = await get(token);
    expect(res.status).toBe(200);
    expect(auditLogResponseSchema.parse(res.body)).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
  });

  it('is restricted to the superadmin (audit.view)', async () => {
    for (const role of ['general_coordinator', 'recinto_coordinator', 'team_leader'] as const) {
      const token = await tokenFor({ role });
      const res = await get(token);
      expect(res.status).toBe(403);
      expect(apiErrorBodySchema.parse(res.body).error.code).toBe('FORBIDDEN');
    }
  });

  it('requires a session', async () => {
    expect((await get(null)).status).toBe(401);
  });

  it('validates the query', async () => {
    const token = await tokenFor({ role: 'superadmin' });
    const res = await get(token, '?from=not-a-date');
    expect(res.status).toBe(400);
    expect(apiErrorBodySchema.parse(res.body).error.fields).toHaveProperty('query.from');
  });

  it('accepts page, pageSize, action and entity filters', async () => {
    const token = await tokenFor({ role: 'superadmin' });
    const res = await get(token, '?page=2&pageSize=5&action=settings.updated&entity=settings');
    expect(res.status).toBe(200);
    expect(auditLogResponseSchema.parse(res.body)).toMatchObject({ page: 2, pageSize: 5 });
  });
});
