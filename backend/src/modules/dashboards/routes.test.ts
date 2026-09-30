import { request } from '../../../test/http';
import type { GeneralDashboardResponse, LeaderDashboardResponse } from '@heribertova/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { buildTestApp, sessionCookie } from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { importFakePadron } from '../../../test/padron';
import { createTestPerson, createTestUser } from '../../../test/users';
import { PersonModel } from '../people/model';
import { RecintoModel } from '../recintos/model';
import { createSession } from '../sessions/service';
import { VoterModel } from '../voters/model';
import { LeadershipEventModel } from '../promotions/model';

useTestDatabase();

const app = buildTestApp();

const BASE_VOTER_SNAPSHOT = {
  fullName: 'JUAN PÉREZ SANTANA',
  recintoKey: 'liceo-juan-pablo-duarte--centro-ciudad',
  recintoName: 'LICEO JUAN PABLO DUARTE',
  colegioId: 4675,
  sector: 'CENTRO CIUDAD',
  birthDate: '1985-03-15',
};

/** The test factory always creates the user's own person at `level: 'coordinator'`, independent of
 * the login `role` — set it explicitly here for scenarios that depend on it. */
async function caller(role: 'aspiring_leader' | 'team_leader' = 'team_leader') {
  const user = await createTestUser({ role });
  await PersonModel.updateOne({ _id: user.personId }, { level: role });
  const { token } = await createSession(user, { ip: null, userAgent: null });
  return { user, token };
}

function get(token: string) {
  return request(app).get('/api/dashboards/leader').set('Cookie', sessionCookie(token));
}

describe('GET /api/dashboards/leader', () => {
  it("uses the auto-promotion threshold as an aspirant's goal", async () => {
    const { user, token } = await caller('aspiring_leader');
    await createTestPerson({
      registeredBy: user._id,
      leaderId: user.personId,
      ancestors: [user.personId],
    });

    const res = await get(token);

    expect(res.status).toBe(200);
    const body = res.body as LeaderDashboardResponse;
    expect(body.level).toBe('aspiring_leader');
    expect(body.goal).toBe(8);
    expect(body.memberCount).toBe(1);
  });

  it('uses the team goal for a team leader', async () => {
    const { token } = await caller('team_leader');
    const res = await get(token);
    expect((res.body as LeaderDashboardResponse).goal).toBe(20);
  });

  it('counts direct members without a cédula photo, ignoring the caller and other teams', async () => {
    const { user, token } = await caller('team_leader');
    await createTestPerson({
      registeredBy: user._id,
      leaderId: user.personId,
      ancestors: [user.personId],
      docStatus: 'pending',
    });
    await createTestPerson({
      registeredBy: user._id,
      leaderId: user.personId,
      ancestors: [user.personId],
      docStatus: 'complete',
      photos: {
        cedula: { key: 'people/x/cedula.jpg', uploadedAt: new Date() },
        selfie: { key: 'people/x/selfie.jpg', uploadedAt: new Date() },
      },
    });

    const res = await get(token);
    expect((res.body as LeaderDashboardResponse).membersMissingCedulaPhoto).toBe(1);
  });

  describe('birthdaysThisMonth', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-06-15T12:00:00-04:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('lists only direct members born this month, sorted by day', async () => {
      const { user, token } = await caller('team_leader');
      await createTestPerson({
        registeredBy: user._id,
        leaderId: user.personId,
        ancestors: [user.personId],
        voterSnapshot: { ...BASE_VOTER_SNAPSHOT, fullName: 'LATE JUNE', birthDate: '1990-06-27' },
      });
      await createTestPerson({
        registeredBy: user._id,
        leaderId: user.personId,
        ancestors: [user.personId],
        voterSnapshot: { ...BASE_VOTER_SNAPSHOT, fullName: 'EARLY JUNE', birthDate: '1978-06-03' },
      });
      await createTestPerson({
        registeredBy: user._id,
        leaderId: user.personId,
        ancestors: [user.personId],
        voterSnapshot: {
          ...BASE_VOTER_SNAPSHOT,
          fullName: 'NOT THIS MONTH',
          birthDate: '1985-07-03',
        },
      });

      const res = await get(token);
      const body = res.body as LeaderDashboardResponse;
      expect(body.birthdaysThisMonth.map((b) => b.fullName)).toEqual(['EARLY JUNE', 'LATE JUNE']);
      expect(body.birthdaysThisMonth.map((b) => b.day)).toEqual([3, 27]);
    });
  });

  it('lists open aspirants nominated by the caller, with their own member count', async () => {
    const { user, token } = await caller('team_leader');
    const aspirant = await createTestPerson({
      registeredBy: user._id,
      level: 'aspiring_leader',
    });
    await createTestPerson({
      registeredBy: user._id,
      leaderId: aspirant._id,
      ancestors: [aspirant._id],
    });
    await LeadershipEventModel.create({
      personId: aspirant._id,
      from: 'member',
      to: 'aspiring_leader',
      reason: 'nominated',
      actorUserId: user._id,
      memberCount: 2,
      at: new Date(),
    });

    const res = await get(token);
    const body = res.body as LeaderDashboardResponse;
    expect(body.nominatedAspirants).toEqual([
      { id: aspirant._id.toHexString(), fullName: aspirant.voterSnapshot.fullName, memberCount: 1 },
    ]);
  });
});

describe('GET /api/dashboards/general', () => {
  // A fresh app per test, not the module-level `app` above: `/dashboards/general` caches its
  // result for 60 s (plan 8.1), and these tests freeze the clock at the same instant every time,
  // so a shared app would serve one test's cached response to the next.
  let generalApp: ReturnType<typeof buildTestApp>;

  function getGeneral(token: string) {
    return request(generalApp).get('/api/dashboards/general').set('Cookie', sessionCookie(token));
  }

  beforeEach(() => {
    generalApp = buildTestApp();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00-04:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("narrows totals and sector coverage to a recinto coordinator's own recintos", async () => {
    // importFakePadron(20) opens one colegio (and so one recinto) per voter, so any two of the
    // first 20 voters vote in two distinct recintos (test/fakeVoterFile.ts).
    const records = await importFakePadron(20);
    const [voterA, voterB] = await Promise.all([
      VoterModel.findById(records[0]?.cedula).lean(),
      VoterModel.findById(records[1]?.cedula).lean(),
    ]);
    if (!voterA || !voterB) throw new Error('Expected two synthetic voters');
    expect(voterA.recintoKey).not.toBe(voterB.recintoKey);

    const registrar = await createTestUser();
    await createTestPerson({
      registeredBy: registrar._id,
      voterSnapshot: {
        fullName: voterA.fullName,
        recintoKey: voterA.recintoKey,
        recintoName: 'RECINTO A',
        colegioId: voterA.colegioId,
        sector: voterA.sector,
        birthDate: voterA.birthDate,
      },
    });
    await createTestPerson({
      registeredBy: registrar._id,
      voterSnapshot: {
        fullName: voterB.fullName,
        recintoKey: voterB.recintoKey,
        recintoName: 'RECINTO B',
        colegioId: voterB.colegioId,
        sector: voterB.sector,
        birthDate: voterB.birthDate,
      },
    });

    const coordinator = await createTestUser({
      role: 'recinto_coordinator',
      recintoScopes: [voterA.recintoKey],
    });
    const { token: coordinatorToken } = await createSession(coordinator, {
      ip: null,
      userAgent: null,
    });
    const scoped = await getGeneral(coordinatorToken);
    expect(scoped.status).toBe(200);
    const scopedBody = scoped.body as GeneralDashboardResponse;
    expect(scopedBody.totals.totalRegistered).toBe(1);
    expect(scopedBody.totals.recintos).toBe(1);
    expect(scopedBody.coverageBySector).toEqual([
      expect.objectContaining({ sector: voterA.sector, memberCount: 1 }),
    ]);

    const { token: superadminToken } = await createSession(
      await createTestUser({ role: 'superadmin' }),
      { ip: null, userAgent: null },
    );
    const everything = await getGeneral(superadminToken);
    const everythingBody = everything.body as GeneralDashboardResponse;
    // Unscoped totalRegistered counts every person, matching /api/people (plan 8.2): the 2 above,
    // plus one each for the registrar, the coordinator and the superadmin caller (every test user
    // has a `people` document too).
    expect(everythingBody.totals.totalRegistered).toBe(5);
    expect(everythingBody.totals.recintos).toBe(await RecintoModel.countDocuments());
  });

  it('buckets voters and members by age band at the boundary', async () => {
    const records = await importFakePadron(1);
    const voter = await VoterModel.findById(records[0]?.cedula);
    if (!voter) throw new Error('Expected one synthetic voter');
    // "today" is 2026-06-15: exactly 25, the top of band 18-25.
    voter.birthDate = '2001-06-15';
    await voter.save();

    // The caller is also who registers, so it is the one incidental person this adds to the
    // count (every test user has a `people` document too) — its default birth date (1985-03-15,
    // 41 today) falls in band 36-50, so the explicit members below use the two bands above it
    // instead, which stay exact.
    const caller = await createTestUser({ role: 'superadmin' });
    await createTestPerson({
      registeredBy: caller._id,
      voterSnapshot: { ...BASE_VOTER_SNAPSHOT, birthDate: '1961-06-15' }, // exactly 65
    });
    await createTestPerson({
      registeredBy: caller._id,
      voterSnapshot: { ...BASE_VOTER_SNAPSHOT, birthDate: '1960-06-14' }, // 66 yesterday
    });

    const { token } = await createSession(caller, { ip: null, userAgent: null });
    const body = (await getGeneral(token)).body as GeneralDashboardResponse;

    expect(body.ageBands['18-25'].voterCount).toBe(1);
    expect(body.ageBands['51-65'].memberCount).toBe(1);
    expect(body.ageBands['65+'].memberCount).toBe(1);
  });

  it("buckets leaders' progress and counts teams at goal", async () => {
    const registrar = await createTestUser();
    const aspirant = await createTestPerson({
      registeredBy: registrar._id,
      level: 'aspiring_leader',
    });
    await createTestPerson({
      registeredBy: registrar._id,
      leaderId: aspirant._id,
      ancestors: [aspirant._id],
    });
    await createTestPerson({
      registeredBy: registrar._id,
      leaderId: aspirant._id,
      ancestors: [aspirant._id],
    }); // 2 of 8 (default autoPromotionThreshold) = 25% exactly

    const teamLeader = await createTestPerson({
      registeredBy: registrar._id,
      level: 'team_leader',
    });
    for (let i = 0; i < 20; i += 1) {
      await createTestPerson({
        registeredBy: registrar._id,
        leaderId: teamLeader._id,
        ancestors: [teamLeader._id],
      });
    } // 20 of 20 (default teamGoal) = 100%

    const { token } = await createSession(await createTestUser({ role: 'superadmin' }), {
      ip: null,
      userAgent: null,
    });
    const body = (await getGeneral(token)).body as GeneralDashboardResponse;

    expect(body.leaderProgress.aspiringLeaders['25-49']).toBe(1);
    expect(body.leaderProgress.teamLeaders['100+']).toBe(1);
    expect(body.teamsAtGoal).toBe(1);
  });

  it('fills registrationsOverTime for the last 30 days with no gaps, and lists this month’s birthdays', async () => {
    // The caller is also who registers, so today's count is that one incidental person (every
    // test user has a `people` document too, created "today" under fake time) plus this member.
    const caller = await createTestUser({ role: 'superadmin' });
    await createTestPerson({
      registeredBy: caller._id,
      voterSnapshot: { ...BASE_VOTER_SNAPSHOT, fullName: 'CUMPLE HOY', birthDate: '1990-06-15' },
    });

    const { token } = await createSession(caller, { ip: null, userAgent: null });
    const body = (await getGeneral(token)).body as GeneralDashboardResponse;

    expect(body.registrationsOverTime).toHaveLength(30);
    expect(body.registrationsOverTime[29]).toEqual({ date: '2026-06-15', count: 2 });
    expect(body.registrationsOverTime[0]?.date).toBe('2026-05-17');
    expect(body.birthdaysThisMonth.count).toBe(1);
    expect(body.birthdaysThisMonth.upcoming).toEqual([
      { id: expect.any(String) as string, fullName: 'CUMPLE HOY', day: 15 },
    ]);
  });

  // Plan 8.2's "Done when": /reportes's predefined tables must agree with this dashboard's totals.
  it("reconciles with /api/people and /api/leaders' counts for the same caller", async () => {
    const caller = await createTestUser({ role: 'superadmin' });
    await createTestPerson({ registeredBy: caller._id, level: 'member' });
    await createTestPerson({ registeredBy: caller._id, level: 'member' });
    await createTestPerson({ registeredBy: caller._id, level: 'team_leader' });
    await createTestPerson({ registeredBy: caller._id, level: 'aspiring_leader' });
    const { token } = await createSession(caller, { ip: null, userAgent: null });

    const dashboard = (await getGeneral(token)).body as GeneralDashboardResponse;
    const people = (
      await request(generalApp).get('/api/people?pageSize=100').set('Cookie', sessionCookie(token))
    ).body as { total: number };
    const teamLeaders = (
      await request(generalApp)
        .get('/api/leaders?level=team_leader')
        .set('Cookie', sessionCookie(token))
    ).body as { items: unknown[] };
    const aspiringLeaders = (
      await request(generalApp)
        .get('/api/leaders?level=aspiring_leader')
        .set('Cookie', sessionCookie(token))
    ).body as { items: unknown[] };

    expect(people.total).toBe(dashboard.totals.totalRegistered);
    expect(teamLeaders.items).toHaveLength(dashboard.totals.teamLeaders);
    expect(aspiringLeaders.items).toHaveLength(dashboard.totals.aspiringLeaders);
  });
});
