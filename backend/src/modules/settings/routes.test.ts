import { request } from '../../../test/http';
import { DEFAULT_PROMOTION_SETTINGS, type PromotionSettings } from '@heribertova/shared';
import { describe, expect, it } from 'vitest';
import { buildTestApp, sameOriginHeaders, sessionCookie } from '../../../test/app';
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

describe('GET /api/settings/promotion', () => {
  it('seeds and returns the LOE defaults on first read', async () => {
    const token = await tokenFor({ role: 'superadmin' });
    const res = await request(app)
      .get('/api/settings/promotion')
      .set('Cookie', sessionCookie(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_PROMOTION_SETTINGS);
  });

  it('is readable by any logged-in role, not just the superadmin (plan 6.3 needs it for nominating)', async () => {
    const token = await tokenFor({ role: 'team_leader' });
    const res = await request(app)
      .get('/api/settings/promotion')
      .set('Cookie', sessionCookie(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_PROMOTION_SETTINGS);
  });
});

describe('PUT /api/settings/promotion', () => {
  it('updates and persists the thresholds, and is audited', async () => {
    const token = await tokenFor({ role: 'superadmin' });
    const next: PromotionSettings = {
      nominationMinInitialMembers: 3,
      autoPromotionThreshold: 10,
      teamGoal: 25,
      maxOpenAspirantsPerNominator: 2,
    };

    const put = await request(app)
      .put('/api/settings/promotion')
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token))
      .send(next);
    expect(put.status).toBe(200);
    expect(put.body).toEqual(next);

    const get = await request(app)
      .get('/api/settings/promotion')
      .set('Cookie', sessionCookie(token));
    expect(get.body).toEqual(next);
  });

  it('is restricted to the superadmin (settings.manage)', async () => {
    const token = await tokenFor({ role: 'general_coordinator' });
    const res = await request(app)
      .put('/api/settings/promotion')
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token))
      .send(DEFAULT_PROMOTION_SETTINGS);
    expect(res.status).toBe(403);
  });
});
