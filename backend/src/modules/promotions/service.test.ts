import { request } from '../../../test/http';
import { apiErrorBodySchema, type NominationResponse, type Role } from '@heribertova/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, sameOriginHeaders, sessionCookie } from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { importFakePadron } from '../../../test/padron';
import { createTestPerson, createTestUser } from '../../../test/users';
import { Types } from 'mongoose';
import { PersonModel } from '../people/model';
import { UserModel } from '../users/model';
import type { RawVoterRecord } from '../voters/voterFile';
import { VoterModel, type Voter } from '../voters/model';
import { createSession } from '../sessions/service';
import { LeadershipEventModel } from './model';

useTestDatabase();

const app = buildTestApp();

let records: RawVoterRecord[];

beforeEach(async () => {
  records = await importFakePadron(80);
});

async function voterAt(index: number): Promise<Voter> {
  const voter = await VoterModel.findById(records[index]?.cedula).lean();
  if (!voter) throw new Error(`No voter at ${index}`);
  return voter;
}

async function caller(role: Role = 'team_leader') {
  const user = await createTestUser({ role });
  const { token } = await createSession(user, { ip: null, userAgent: null });
  return { user, token };
}

function initialMemberFor(cedula: string) {
  return { cedula, phone: '8095551234', phoneWhatsapp: true, consent: true };
}

function nominate(token: string, body: object) {
  return request(app)
    .post('/api/promotions/nominations')
    .set(sameOriginHeaders)
    .set('Cookie', sessionCookie(token))
    .send(body);
}

async function nominateVoters(
  token: string,
  nomineeIdx: number,
  member1Idx: number,
  member2Idx: number,
) {
  const nominee = await voterAt(nomineeIdx);
  const m1 = await voterAt(member1Idx);
  const m2 = await voterAt(member2Idx);
  return nominate(token, {
    nomineeCedula: nominee._id,
    nomineePhone: '8095551234',
    nomineePhoneWhatsapp: true,
    initialMembers: [initialMemberFor(m1._id), initialMemberFor(m2._id)],
  });
}

function registerPerson(token: string, cedula: string) {
  return request(app)
    .post('/api/people')
    .set(sameOriginHeaders)
    .set('Cookie', sessionCookie(token))
    .send({ cedula, phone: '8095551234', phoneWhatsapp: true, consent: true });
}

function getLeaders(token: string, query = '') {
  return request(app).get(`/api/leaders${query}`).set('Cookie', sessionCookie(token));
}

describe('GET /api/leaders', () => {
  it("is scoped: a team leader sees only their own subtree's leaders/aspirants", async () => {
    const { token: teamLeaderToken } = await caller('team_leader');
    const ownNomination = await nominateVoters(teamLeaderToken, 60, 61, 62);
    expect(ownNomination.status).toBe(201);

    const { token: otherCoordToken } = await caller('general_coordinator');
    const otherNomination = await nominateVoters(otherCoordToken, 63, 64, 65);
    expect(otherNomination.status).toBe(201);

    const res = await getLeaders(teamLeaderToken);

    expect(res.status).toBe(200);
    const cedulas = (res.body as { items: { cedula: string }[] }).items.map((item) => item.cedula);
    expect(cedulas).toEqual([(await voterAt(60))._id]);
  });

  it('lists the team, member count and goal for an aspirant', async () => {
    const { token } = await caller('general_coordinator');
    await nominateVoters(token, 66, 67, 68);

    const res = await getLeaders(token, '?level=aspiring_leader');

    expect(res.status).toBe(200);
    const [item] = (res.body as { items: { memberCount: number; goal: number; team: unknown[] }[] })
      .items;
    expect(item?.memberCount).toBe(2);
    expect(item?.goal).toBe(8); // default autoPromotionThreshold
    expect(item?.team).toHaveLength(2);
  });

  it('filters by level', async () => {
    const { token } = await caller('general_coordinator');
    await nominateVoters(token, 69, 70, 71);

    const res = await getLeaders(token, '?level=team_leader');

    expect(res.status).toBe(200);
    expect((res.body as { items: unknown[] }).items).toHaveLength(0);
  });
});

describe('POST /api/promotions/nominations', () => {
  it('nominates a brand-new person, registers the initial members, and creates a login', async () => {
    const { token } = await caller('team_leader');

    const res = await nominateVoters(token, 0, 1, 2);

    expect(res.status).toBe(201);
    const { personId, userId } = res.body as NominationResponse;
    const person = await PersonModel.findById(personId).lean();
    expect(person?.level).toBe('aspiring_leader');
    await expect(
      PersonModel.countDocuments({ leaderId: person?._id, deletedAt: null }),
    ).resolves.toBe(2);
    const user = await UserModel.findById(userId).lean();
    expect(user?.role).toBe('aspiring_leader');
    expect(user?.usingDefaultPassword).toBe(true);
    await expect(
      LeadershipEventModel.countDocuments({ personId, reason: 'nominated' }),
    ).resolves.toBe(1);
  });

  it("promotes an existing member of the team leader's own team in place", async () => {
    const { token, user: leaderUser } = await caller('team_leader');
    const nomineeVoter = await voterAt(3);
    await registerPerson(token, nomineeVoter._id);

    const res = await nominate(token, {
      nomineeCedula: nomineeVoter._id,
      nomineePhone: '8095551234',
      nomineePhoneWhatsapp: true,
      initialMembers: [
        initialMemberFor((await voterAt(4))._id),
        initialMemberFor((await voterAt(5))._id),
      ],
    });

    expect(res.status).toBe(201);
    const person = await PersonModel.findOne({ cedula: nomineeVoter._id }).lean();
    expect(person?.level).toBe('aspiring_leader');
    expect(person?.leaderId?.toString()).toBe(leaderUser.personId.toString());
  });

  it('refuses a team leader nominating someone outside their own team', async () => {
    const { token } = await caller('team_leader');
    const { token: otherToken } = await caller('team_leader');
    const nomineeVoter = await voterAt(6);
    await registerPerson(otherToken, nomineeVoter._id);

    const res = await nominate(token, {
      nomineeCedula: nomineeVoter._id,
      nomineePhone: '8095551234',
      nomineePhoneWhatsapp: true,
      initialMembers: [
        initialMemberFor((await voterAt(7))._id),
        initialMemberFor((await voterAt(8))._id),
      ],
    });

    expect(res.status).toBe(403);
  });

  it('refuses to nominate someone who is already a leader or coordinator', async () => {
    const { token } = await caller('general_coordinator');
    const nominationA = await nominateVoters(token, 9, 10, 11);
    expect(nominationA.status).toBe(201);
    const nomineeA = await VoterModel.findById(records[9]?.cedula).lean();

    const res = await nominate(token, {
      nomineeCedula: nomineeA?._id,
      nomineePhone: '8095551234',
      nomineePhoneWhatsapp: true,
      initialMembers: [
        initialMemberFor((await voterAt(12))._id),
        initialMemberFor((await voterAt(13))._id),
      ],
    });

    expect(res.status).toBe(400);
    expect(apiErrorBodySchema.parse(res.body).error.fields).toHaveProperty('nomineeCedula');
  });

  it('rejects fewer than the configured minimum initial members', async () => {
    const { token } = await caller('general_coordinator');
    const nominee = await voterAt(14);
    const m1 = await voterAt(15);

    const res = await nominate(token, {
      nomineeCedula: nominee._id,
      nomineePhone: '8095551234',
      nomineePhoneWhatsapp: true,
      initialMembers: [initialMemberFor(m1._id)],
    });

    expect(res.status).toBe(400);
  });

  it('limits open aspirants per nominator (default: one at a time)', async () => {
    const { token } = await caller('general_coordinator');

    const first = await nominateVoters(token, 16, 17, 18);
    expect(first.status).toBe(201);

    const second = await nominateVoters(token, 19, 20, 21);
    expect(second.status).toBe(400);
  });
});

describe('auto-promotion threshold (concurrency)', () => {
  it('promotes exactly once under 20 concurrent registrations crossing the threshold', async () => {
    const { token: coordToken } = await caller('general_coordinator');
    const nomination = await nominateVoters(coordToken, 22, 23, 24);
    expect(nomination.status).toBe(201);
    const { personId, userId } = nomination.body as NominationResponse;

    const aspirantUser = await UserModel.findById(userId);
    if (!aspirantUser) throw new Error('missing aspirant user');
    const { token: aspirantToken } = await createSession(aspirantUser, {
      ip: null,
      userAgent: null,
    });

    // Already has 2 members from the nomination; 20 more concurrent registrations cross the
    // default threshold of 8 well before all of them land.
    const extraVoters = await Promise.all(Array.from({ length: 20 }, (_, i) => voterAt(25 + i)));
    const results = await Promise.all(
      extraVoters.map((voter) => registerPerson(aspirantToken, voter._id)),
    );

    expect(results.every((res) => res.status === 201)).toBe(true);
    const person = await PersonModel.findById(personId).lean();
    expect(person?.level).toBe('team_leader');
    const user = await UserModel.findById(userId).lean();
    expect(user?.role).toBe('team_leader');
    await expect(
      LeadershipEventModel.countDocuments({ personId, reason: 'auto_threshold' }),
    ).resolves.toBe(1);
  });
});

describe('POST /api/promotions/:personId/promote', () => {
  it('promotes an aspirant to team leader manually', async () => {
    const { token } = await caller('general_coordinator');
    const nomination = await nominateVoters(token, 45, 46, 47);
    const { personId, userId } = nomination.body as NominationResponse;

    const res = await request(app)
      .post(`/api/promotions/${personId}/promote`)
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token))
      .send({ reason: 'Buen desempeño' });

    expect(res.status).toBe(204);
    const person = await PersonModel.findById(personId).lean();
    expect(person?.level).toBe('team_leader');
    const user = await UserModel.findById(userId).lean();
    expect(user?.role).toBe('team_leader');
    await expect(
      LeadershipEventModel.countDocuments({ personId, reason: 'manual', to: 'team_leader' }),
    ).resolves.toBe(1);
  });

  it('refuses to promote a plain member', async () => {
    const { token } = await caller('general_coordinator');
    const target = await createTestPerson({ registeredBy: new Types.ObjectId(), level: 'member' });

    const res = await request(app)
      .post(`/api/promotions/${target.id}/promote`)
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token))
      .send({ reason: 'x' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/promotions/:personId/demote', () => {
  it('demotes a team leader to aspiring leader, keeping the login active', async () => {
    const { token } = await caller('general_coordinator');
    const nomination = await nominateVoters(token, 48, 49, 50);
    const { personId, userId } = nomination.body as NominationResponse;
    await request(app)
      .post(`/api/promotions/${personId}/promote`)
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token))
      .send({ reason: 'Adelanto' });

    const res = await request(app)
      .post(`/api/promotions/${personId}/demote`)
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token))
      .send({ reason: 'Bajo desempeño' });

    expect(res.status).toBe(204);
    const person = await PersonModel.findById(personId).lean();
    expect(person?.level).toBe('aspiring_leader');
    const user = await UserModel.findById(userId).lean();
    expect(user?.role).toBe('aspiring_leader');
    expect(user?.isActive).toBe(true);
  });

  it('demotes an aspiring leader to member and deactivates the login', async () => {
    const { token } = await caller('general_coordinator');
    const nomination = await nominateVoters(token, 51, 52, 53);
    const { personId, userId } = nomination.body as NominationResponse;

    const res = await request(app)
      .post(`/api/promotions/${personId}/demote`)
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token))
      .send({ reason: 'Inactivo' });

    expect(res.status).toBe(204);
    const person = await PersonModel.findById(personId).lean();
    expect(person?.level).toBe('member');
    const user = await UserModel.findById(userId).lean();
    expect(user?.isActive).toBe(false);
  });
});
