import { request } from '../../../test/http';
import { apiErrorBodySchema, type PersonDetail, type Role } from '@heribertova/shared';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, sameOriginHeaders, sessionCookie } from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { importFakePadron } from '../../../test/padron';
import { createTestPerson, createTestUser } from '../../../test/users';
import { PersonModel } from './model';
import type { RawVoterRecord } from '../voters/voterFile';
import { VoterModel, type Voter } from '../voters/model';
import { createSession } from '../sessions/service';

useTestDatabase();

const app = buildTestApp();

let records: RawVoterRecord[];

beforeEach(async () => {
  records = await importFakePadron(30);
});

async function voterAt(index: number): Promise<Voter> {
  const voter = await VoterModel.findById(records[index]?.cedula).lean();
  if (!voter) throw new Error(`No voter at ${index}`);
  return voter;
}

async function caller(role: Role = 'team_leader') {
  const user = await createTestUser({ role });
  const { token } = await createSession(user, { ip: null, userAgent: null });
  return token;
}

function register(token: string, body: object, idempotencyKey?: string) {
  const req = request(app)
    .post('/api/people')
    .set(sameOriginHeaders)
    .set('Cookie', sessionCookie(token))
    .send(body);
  return idempotencyKey ? req.set('Idempotency-Key', idempotencyKey) : req;
}

function requestFor(cedula: string, overrides: object = {}) {
  return { cedula, phone: '8095551234', phoneWhatsapp: true, consent: true, ...overrides };
}

describe('POST /api/people', () => {
  it('registers a member under the caller, with the padrón fields snapshotted', async () => {
    const token = await caller();
    const voter = await voterAt(0);

    const res = await register(token, requestFor(voter._id));

    expect(res.status).toBe(201);
    const person = res.body as PersonDetail;
    expect(person).toMatchObject({ cedula: voter._id, fullName: voter.fullName, level: 'member' });
    await expect(PersonModel.countDocuments({ cedula: voter._id })).resolves.toBe(1);
  });

  it('answers 404 for a cédula outside the padrón', async () => {
    const token = await caller();
    const res = await register(token, requestFor('99999999999'));
    expect(res.status).toBe(404);
  });

  it('answers 400 for a cédula already registered', async () => {
    const token = await caller();
    const voter = await voterAt(1);
    await register(token, requestFor(voter._id));

    const res = await register(token, requestFor(voter._id));

    expect(res.status).toBe(400);
    expect(apiErrorBodySchema.parse(res.body).error.fields).toHaveProperty('body.cedula');
  });

  it('requires consent', async () => {
    const token = await caller();
    const voter = await voterAt(2);
    const res = await register(token, {
      cedula: voter._id,
      phone: '8095551234',
      phoneWhatsapp: true,
    });
    expect(res.status).toBe(400);
  });

  describe('Idempotency-Key', () => {
    it('returns the same person on a retried submit instead of a duplicate error', async () => {
      const token = await caller();
      const voter = await voterAt(3);
      const key = 'retry-key-1';

      const first = await register(token, requestFor(voter._id), key);
      const second = await register(token, requestFor(voter._id), key);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect((second.body as PersonDetail).id).toBe((first.body as PersonDetail).id);
      await expect(PersonModel.countDocuments({ cedula: voter._id })).resolves.toBe(1);
    });

    it('two concurrent retries with the same key still produce exactly one person', async () => {
      const token = await caller();
      const voter = await voterAt(4);
      const key = 'retry-key-2';

      const [a, b] = await Promise.all([
        register(token, requestFor(voter._id), key),
        register(token, requestFor(voter._id), key),
      ]);

      expect([a.status, b.status]).toEqual([201, 201]);
      await expect(PersonModel.countDocuments({ cedula: voter._id })).resolves.toBe(1);
    });
  });

  it('two concurrent registrations of the same cédula (no idempotency key) produce exactly one person', async () => {
    const token = await caller();
    const voter = await voterAt(5);

    const results = await Promise.all([
      register(token, requestFor(voter._id)),
      register(token, requestFor(voter._id)),
    ]);

    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status === 400)).toHaveLength(1);
    await expect(PersonModel.countDocuments({ cedula: voter._id })).resolves.toBe(1);
  });
});

describe('GET /api/people', () => {
  it('is scoped: a team leader sees only their own subtree', async () => {
    const leader = await createTestUser({ role: 'team_leader' });
    const { token } = await createSession(leader, { ip: null, userAgent: null });
    await createTestPerson({
      registeredBy: leader._id,
      leaderId: leader.personId,
      ancestors: [leader.personId],
    });
    await createTestPerson({ registeredBy: new Types.ObjectId() }); // someone else's, out of scope

    const res = await request(app).get('/api/people').set('Cookie', sessionCookie(token));

    expect(res.status).toBe(200);
    expect((res.body as { total: number }).total).toBe(1);
  });

  // Plan 8.2's `/reportes` "members by sector/recinto/colegio" report reuses this same endpoint.
  it('filters by sector, recintoKey and colegioId', async () => {
    const registrar = await createTestUser({ role: 'general_coordinator' });
    const { token } = await createSession(registrar, { ip: null, userAgent: null });
    // Not voterAt(0): its colegioId (4675) is also the registrar's own default test fixture
    // colegio (test/users.ts), which would otherwise double-count as "in colegio 4675".
    const voterA = await voterAt(2);
    const voterB = await voterAt(3);
    expect(voterA.recintoKey).not.toBe(voterB.recintoKey);

    for (const voter of [voterA, voterB]) {
      await createTestPerson({
        registeredBy: registrar._id,
        voterSnapshot: {
          fullName: voter.fullName,
          recintoKey: voter.recintoKey,
          recintoName: voter.fullName,
          colegioId: voter.colegioId,
          sector: voter.sector,
          birthDate: voter.birthDate,
        },
      });
    }

    const bySector = await request(app)
      .get(`/api/people?sector=${encodeURIComponent(voterA.sector)}`)
      .set('Cookie', sessionCookie(token));
    expect((bySector.body as { total: number }).total).toBe(1);

    const byRecinto = await request(app)
      .get(`/api/people?recintoKey=${encodeURIComponent(voterA.recintoKey)}`)
      .set('Cookie', sessionCookie(token));
    expect((byRecinto.body as { total: number }).total).toBe(1);

    const byColegio = await request(app)
      .get(`/api/people?colegioId=${voterA.colegioId}`)
      .set('Cookie', sessionCookie(token));
    expect((byColegio.body as { total: number }).total).toBe(1);
  });

  // Plan 8.2's "members missing photos" report: distinct from `docStatus`, since `docStatus:
  // 'partial'` doesn't say which of the two photos is missing.
  it('filters people missing the cédula photo, independent of docStatus', async () => {
    const registrar = await createTestUser({ role: 'general_coordinator' });
    // Kept out of the "missing" count below: a fresh test person has no `photos` at all.
    await PersonModel.updateOne(
      { _id: registrar.personId },
      { photos: { cedula: { key: 'registrar', uploadedAt: new Date() } } },
    );
    const { token } = await createSession(registrar, { ip: null, userAgent: null });

    await createTestPerson({
      registeredBy: registrar._id,
      docStatus: 'partial',
      photos: { selfie: { key: 'has-selfie-only', uploadedAt: new Date() } },
    });
    await createTestPerson({
      registeredBy: registrar._id,
      docStatus: 'partial',
      photos: { cedula: { key: 'has-cedula-only', uploadedAt: new Date() } },
    });

    const res = await request(app)
      .get('/api/people?missingCedulaPhoto=true')
      .set('Cookie', sessionCookie(token));

    expect(res.status).toBe(200);
    expect((res.body as { total: number }).total).toBe(1);
  });
});

describe('PATCH /api/people/:id', () => {
  it('refuses to set status without people.validate, even though the route only requires people.update', async () => {
    const token = await caller('team_leader');
    const target = await createTestPerson({ registeredBy: new Types.ObjectId() });

    const res = await request(app)
      .patch(`/api/people/${target.id}`)
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token))
      .send({ status: 'confirmed' });

    expect(res.status).toBe(403);
    const stored = await PersonModel.findById(target._id).lean();
    expect(stored?.status).toBeNull();
    expect(stored?.validatedAt).toBeNull();
  });

  it('sets status and stamps validatedBy/validatedAt for a caller with people.validate', async () => {
    const token = await caller('general_coordinator');
    const target = await createTestPerson({ registeredBy: new Types.ObjectId() });

    const res = await request(app)
      .patch(`/api/people/${target.id}`)
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token))
      .send({ status: 'confirmed' });

    expect(res.status).toBe(200);
    expect((res.body as PersonDetail).status).toBe('confirmed');
    expect((res.body as PersonDetail).validatedAt).not.toBeNull();
    const stored = await PersonModel.findById(target._id).lean();
    expect(stored?.status).toBe('confirmed');
    expect(stored?.validatedAt).not.toBeNull();
  });
});

describe('DELETE /api/people/:id', () => {
  it('soft-deletes with a reason', async () => {
    const token = await caller('general_coordinator');
    const target = await createTestPerson({ registeredBy: new Types.ObjectId() });

    const res = await request(app)
      .delete(`/api/people/${target.id}`)
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token))
      .send({ reason: 'Duplicado' });

    expect(res.status).toBe(204);
    const stored = await PersonModel.findById(target._id).lean();
    expect(stored?.deletedAt).not.toBeNull();
    expect(stored?.deletedReason).toBe('Duplicado');
  });

  it('refuses to delete someone who still has members', async () => {
    const token = await caller('general_coordinator');
    const leader = await createTestPerson({ registeredBy: new Types.ObjectId() });
    await createTestPerson({
      registeredBy: new Types.ObjectId(),
      leaderId: leader._id,
      ancestors: [leader._id],
    });

    const res = await request(app)
      .delete(`/api/people/${leader.id}`)
      .set(sameOriginHeaders)
      .set('Cookie', sessionCookie(token))
      .send({ reason: 'Duplicado' });

    expect(res.status).toBe(400);
    const stored = await PersonModel.findById(leader._id).lean();
    expect(stored?.deletedAt).toBeNull();
  });
});
