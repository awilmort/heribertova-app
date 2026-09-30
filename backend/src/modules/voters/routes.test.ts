import { request } from '../../../test/http';
import {
  apiErrorBodySchema,
  sectorsResponseSchema,
  voterCardSchema,
  type Role,
} from '@heribertova/shared';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp, sessionCookie } from '../../../test/app';
import { useTestDatabase } from '../../../test/database';
import { importFakePadron } from '../../../test/padron';
import { createTestPerson, createTestUser } from '../../../test/users';
import { ageOn, campaignDate } from '../../lib/campaignDay';
import type { Person } from '../people/model';
import { createSession } from '../sessions/service';
import { VoterLookupQuotaModel } from './lookupQuota';
import type { RawVoterRecord } from './voterFile';
import { VoterModel, type Voter } from './model';

useTestDatabase();

const app = buildTestApp();

/** A cédula that no synthetic voter has. */
const UNKNOWN_CEDULA = '99999999999';

let records: RawVoterRecord[];

beforeEach(async () => {
  records = await importFakePadron(400);
});

async function voterAt(index: number): Promise<Voter> {
  const voter = await VoterModel.findById(records[index]?.cedula).lean();
  if (!voter) throw new Error(`No voter at ${index}`);
  return voter;
}

async function caller(role: Role = 'team_leader', recintoScopes: string[] = []) {
  const user = await createTestUser({ role, recintoScopes });
  const { token } = await createSession(user, { ip: null, userAgent: null });
  return { user, token };
}

function lookup(token: string, cedula: string, testApp = app) {
  return request(testApp).get(`/api/voters/${cedula}`).set('Cookie', sessionCookie(token));
}

/** Registers the voter as a member under `leaderPersonId`, the way plan 5.1 will. */
function registerMember(voter: Voter, leaderPersonId: Types.ObjectId | null) {
  const snapshot: Person['voterSnapshot'] = {
    fullName: voter.fullName,
    recintoKey: voter.recintoKey,
    recintoName: 'RECINTO',
    colegioId: voter.colegioId,
    sector: voter.sector,
    birthDate: voter.birthDate,
  };
  return createTestPerson({
    cedula: voter._id,
    registeredBy: new Types.ObjectId(),
    voterSnapshot: snapshot,
    level: 'member',
    leaderId: leaderPersonId,
    ancestors: leaderPersonId ? [leaderPersonId] : [],
  });
}

describe('GET /api/voters/:cedula', () => {
  it('returns the padrón card of an active voter', async () => {
    const { token } = await caller();
    const voter = await voterAt(10);

    const res = await lookup(token, voter._id);

    expect(res.status).toBe(200);
    const card = voterCardSchema.parse(res.body);
    expect(card).toEqual({
      cedula: voter._id,
      fullName: voter.fullName,
      age: ageOn(voter.birthDate, campaignDate(new Date())),
      birthDay: voter.birthDay,
      birthMonth: voter.birthMonth,
      sector: voter.sector,
      recintoKey: voter.recintoKey,
      recintoName: expect.any(String) as string,
      colegioId: voter.colegioId,
      membership: { status: 'none' },
    });
    expect(card.recintoName.length).toBeGreaterThan(0);
  });

  it('answers 404 for a cédula that is not in the padrón', async () => {
    const { token } = await caller();
    const res = await lookup(token, UNKNOWN_CEDULA);
    expect(res.status).toBe(404);
    expect(apiErrorBodySchema.parse(res.body).error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Esta cédula no figura en el padrón de Higüey.',
    });
  });

  it('answers 404 for a voter who is no longer in the current padrón', async () => {
    const { token } = await caller();
    const voter = await voterAt(0);
    await VoterModel.updateOne({ _id: voter._id }, { status: 'inactive' });
    expect((await lookup(token, voter._id)).status).toBe(404);
  });

  it('rejects a malformed cédula with 400, without counting it toward the quota', async () => {
    const { token } = await caller();
    const res = await lookup(token, '001-1234567-2');
    expect(res.status).toBe(400);
    expect(apiErrorBodySchema.parse(res.body).error.fields).toHaveProperty('params.cedula');
    expect(await VoterLookupQuotaModel.countDocuments()).toBe(0);
  });

  describe('daily quota', () => {
    /** Seeds `userId`'s quota counter as if they had already looked up `count` cédulas at `at`. */
    function pastLookups(userId: Types.ObjectId, count: number, at: Date) {
      return VoterLookupQuotaModel.create({
        _id: `${userId.toHexString()}:${campaignDate(at)}`,
        count,
        createdAt: at,
      });
    }

    it('allows the 300th lookup of the day and blocks the 301st with 429', async () => {
      const { user, token } = await caller();
      const voter = await voterAt(0);
      await pastLookups(user._id, 299, new Date());

      expect((await lookup(token, voter._id)).status).toBe(200);
      const res = await lookup(token, voter._id);

      expect(res.status).toBe(429);
      expect(apiErrorBodySchema.parse(res.body).error).toMatchObject({
        code: 'RATE_LIMITED',
        message:
          'Alcanzó el límite de 300 consultas del padrón por día. Podrá consultar de nuevo mañana.',
      });
      // The refused lookup is not counted as one.
      const quota = await VoterLookupQuotaModel.findById(
        `${user._id.toHexString()}:${campaignDate(new Date())}`,
      ).lean();
      expect(quota?.count).toBe(300);
    });

    it('counts not-found lookups too, so cédulas cannot be probed for free', async () => {
      const quotaApp = buildTestApp({ config: { VOTER_LOOKUP_DAILY_QUOTA: 2 } });
      const { token } = await caller();
      expect((await lookup(token, UNKNOWN_CEDULA, quotaApp)).status).toBe(404);
      expect((await lookup(token, UNKNOWN_CEDULA, quotaApp)).status).toBe(404);
      expect((await lookup(token, UNKNOWN_CEDULA, quotaApp)).status).toBe(429);
    });

    it('starts over each Santo Domingo day', async () => {
      const { user, token } = await caller();
      // 03:59 UTC today is still yesterday evening in Higüey (UTC−4).
      const todayStart = new Date(`${campaignDate(new Date())}T04:00:00Z`);
      await pastLookups(user._id, 300, new Date(todayStart.getTime() - 60_000));
      expect((await lookup(token, (await voterAt(0))._id)).status).toBe(200);
    });

    it('is counted per user', async () => {
      const busy = await caller();
      const other = await caller();
      await pastLookups(busy.user._id, 300, new Date());
      expect((await lookup(busy.token, (await voterAt(0))._id)).status).toBe(429);
      expect((await lookup(other.token, (await voterAt(0))._id)).status).toBe(200);
    });
  });

  describe('membership', () => {
    it('shows level and team leader of a member in scope', async () => {
      const { user, token } = await caller('team_leader');
      const voter = await voterAt(5);
      await registerMember(voter, user.personId);

      const card = voterCardSchema.parse((await lookup(token, voter._id)).body);

      expect(card.membership).toEqual({
        status: 'member',
        level: 'member',
        leaderName: 'JUAN PÉREZ SANTANA',
      });
    });

    it('only says a member out of scope is registered', async () => {
      const { token } = await caller('team_leader');
      const voter = await voterAt(6);
      const otherLeader = await createTestUser({ role: 'team_leader' });
      await registerMember(voter, otherLeader.personId);

      const card = voterCardSchema.parse((await lookup(token, voter._id)).body);

      expect(card.membership).toEqual({ status: 'out_of_scope' });
    });

    it('shows a recinto coordinator the members voting in their recintos', async () => {
      const voter = await voterAt(7);
      const { token } = await caller('recinto_coordinator', [voter.recintoKey]);
      await registerMember(voter, null);

      const card = voterCardSchema.parse((await lookup(token, voter._id)).body);

      expect(card.membership).toEqual({ status: 'member', level: 'member', leaderName: null });
    });

    it('treats a deleted member as not registered', async () => {
      const { token } = await caller('general_coordinator');
      const voter = await voterAt(8);
      const person = await registerMember(voter, null);
      await person.updateOne({ deletedAt: new Date() });

      const card = voterCardSchema.parse((await lookup(token, voter._id)).body);

      expect(card.membership).toEqual({ status: 'none' });
    });
  });
});

describe('GET /api/sectors', () => {
  async function sectors(token: string) {
    const res = await request(app).get('/api/sectors').set('Cookie', sessionCookie(token));
    expect(res.status).toBe(200);
    return sectorsResponseSchema.parse(res.body).sectors;
  }

  it('is the sector → recinto → colegio tree with active voter counts', async () => {
    const { token } = await caller('aspiring_leader');
    const tree = await sectors(token);

    const distinctSectors = new Set(await VoterModel.distinct('sector'));
    expect(tree.map((sector) => sector.name).sort()).toEqual([...distinctSectors].sort());
    expect(tree.reduce((sum, sector) => sum + sector.voterCount, 0)).toBe(400);

    for (const sector of tree) {
      expect(sector.voterCount).toBe(
        sector.recintos.reduce((sum, recinto) => sum + recinto.voterCount, 0),
      );
      for (const recinto of sector.recintos) {
        expect(recinto.voterCount).toBe(
          await VoterModel.countDocuments({ recintoKey: recinto.key, status: 'active' }),
        );
        for (const colegio of recinto.colegios) {
          expect(colegio.voterCount).toBe(
            await VoterModel.countDocuments({ recintoKey: recinto.key, colegioId: colegio.id }),
          );
        }
      }
    }
  });

  it('sorts sectors and recintos by name, and colegios by number', async () => {
    const { token } = await caller();
    const tree = await sectors(token);
    const sortedByName = <T extends { name: string }>(items: T[]) =>
      [...items].sort((a, b) => a.name.localeCompare(b.name, 'es'));

    expect(tree).toEqual(sortedByName(tree));
    for (const sector of tree) {
      expect(sector.recintos).toEqual(sortedByName(sector.recintos));
      for (const recinto of sector.recintos) {
        expect(recinto.colegios.map((c) => c.id)).toEqual(
          [...recinto.colegios.map((c) => c.id)].sort((a, b) => a - b),
        );
      }
    }
  });

  it('is built once per padrón and rebuilt when another import is applied', async () => {
    const { token } = await caller();
    const aggregate = vi.spyOn(VoterModel, 'aggregate');
    try {
      await sectors(token);
      await sectors(token);
      expect(aggregate).toHaveBeenCalledTimes(1);

      await importFakePadron(250);
      const tree = await sectors(token);

      expect(aggregate).toHaveBeenCalledTimes(2);
      expect(tree.reduce((sum, sector) => sum + sector.voterCount, 0)).toBe(250);
    } finally {
      aggregate.mockRestore();
    }
  });
});
