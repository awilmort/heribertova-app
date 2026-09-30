import type { AppointUserRequest } from '@heribertova/shared';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { importFakePadron } from '../../../test/padron';
import { createTestPerson, createTestUser } from '../../../test/users';
import { AuditLogModel } from '../audit/model';
import type { Actor } from '../audit/service';
import { PersonModel } from '../people/model';
import type { RawVoterRecord } from '../voters/voterFile';
import { VoterModel, type Voter } from '../voters/model';
import { appointCoordinator } from './appoint';
import { UserModel } from './model';

useTestDatabase();

let records: RawVoterRecord[];

beforeEach(async () => {
  records = await importFakePadron(200);
});

async function voterAt(index: number): Promise<Voter> {
  const voter = await VoterModel.findById(records[index]?.cedula).lean();
  if (!voter) throw new Error(`No voter at ${index}`);
  return voter;
}

function actorWith(user: Awaited<ReturnType<typeof createTestUser>>): Actor {
  return { user, ip: '203.0.113.7' };
}

function requestFor(
  cedula: string,
  overrides: Partial<AppointUserRequest> = {},
): AppointUserRequest {
  return {
    cedula,
    role: 'recinto_coordinator',
    recintoScopes: [],
    phone: '8095551234',
    phoneWhatsapp: true,
    ...overrides,
  };
}

describe('appointCoordinator', () => {
  it('appoints a brand-new voter as a general coordinator, on the default (birth date) password', async () => {
    const admin = await createTestUser({ role: 'superadmin' });
    const voter = await voterAt(0);

    const user = await appointCoordinator(
      actorWith(admin),
      requestFor(voter._id, { role: 'general_coordinator', recintoScopes: [] }),
    );

    expect(user).toMatchObject({
      username: voter._id,
      role: 'general_coordinator',
      usingDefaultPassword: true,
      recintoScopes: [],
    });
    const person = await PersonModel.findById(user.personId).lean();
    expect(person).toMatchObject({
      cedula: voter._id,
      level: 'coordinator',
      phone: '8095551234',
      phoneWhatsapp: true,
      voterSnapshot: expect.objectContaining({ fullName: voter.fullName }) as unknown,
    });
  });

  it('appoints a recinto coordinator with the given recintoScopes', async () => {
    const admin = await createTestUser({ role: 'superadmin' });
    const voter = await voterAt(1);

    const user = await appointCoordinator(
      actorWith(admin),
      requestFor(voter._id, { role: 'recinto_coordinator', recintoScopes: [voter.recintoKey] }),
    );

    expect(user.recintoScopes).toEqual([voter.recintoKey]);
  });

  it('appoints an existing member without changing their contact details', async () => {
    const admin = await createTestUser({ role: 'superadmin' });
    const voter = await voterAt(2);
    const member = await createTestPerson({
      cedula: voter._id,
      registeredBy: new Types.ObjectId(),
      phone: '8299990000',
      phoneWhatsapp: false,
      level: 'member',
      voterSnapshot: {
        fullName: voter.fullName,
        recintoKey: voter.recintoKey,
        recintoName: 'RECINTO',
        colegioId: voter.colegioId,
        sector: voter.sector,
        birthDate: voter.birthDate,
      },
    });

    const user = await appointCoordinator(
      actorWith(admin),
      requestFor(voter._id, {
        role: 'recinto_coordinator',
        recintoScopes: [voter.recintoKey],
        phone: '8095550000',
        phoneWhatsapp: true,
      }),
    );

    expect(user.personId).toEqual(member._id);
    const person = await PersonModel.findById(member._id).lean();
    expect(person).toMatchObject({ phone: '8299990000', phoneWhatsapp: false, level: 'member' });
  });

  it('answers 404 for a cédula that is not an active Higüey voter, creating nothing', async () => {
    const admin = await createTestUser({ role: 'superadmin' });
    // recintoScopes empty: isolates the voter lookup from the recinto-validation check below.
    await expect(
      appointCoordinator(
        actorWith(admin),
        requestFor('99999999999', { role: 'general_coordinator', recintoScopes: [] }),
      ),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    // Only the admin caller's own account exists.
    await expect(UserModel.countDocuments()).resolves.toBe(1);
    await expect(PersonModel.countDocuments()).resolves.toBe(1);
  });

  it('refuses a cédula that already has a login, creating no second account', async () => {
    const admin = await createTestUser({ role: 'superadmin' });
    const voter = await voterAt(3);
    await appointCoordinator(
      actorWith(admin),
      requestFor(voter._id, { role: 'recinto_coordinator', recintoScopes: [voter.recintoKey] }),
    );
    const usersAfterFirst = await UserModel.countDocuments();

    await expect(
      appointCoordinator(
        actorWith(admin),
        requestFor(voter._id, { role: 'recinto_coordinator', recintoScopes: [voter.recintoKey] }),
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: { 'body.cedula': ['Esta persona ya tiene una cuenta de acceso.'] },
    });
    await expect(UserModel.countDocuments()).resolves.toBe(usersAfterFirst);
  });

  it('refuses a recintoScopes entry that is not a real recinto, creating nothing', async () => {
    const admin = await createTestUser({ role: 'superadmin' });
    const voter = await voterAt(4);
    const [usersBefore, peopleBefore] = [
      await UserModel.countDocuments(),
      await PersonModel.countDocuments(),
    ];

    await expect(
      appointCoordinator(
        actorWith(admin),
        requestFor(voter._id, {
          role: 'recinto_coordinator',
          recintoScopes: ['no-existe--sector'],
        }),
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: { 'body.recintoScopes': ['Hay un recinto que no existe.'] },
    });
    await expect(UserModel.countDocuments()).resolves.toBe(usersBefore);
    await expect(PersonModel.countDocuments()).resolves.toBe(peopleBefore);
  });

  describe('rank', () => {
    it('lets a general coordinator appoint a recinto coordinator', async () => {
      const admin = await createTestUser({ role: 'general_coordinator' });
      const voter = await voterAt(5);
      const user = await appointCoordinator(
        actorWith(admin),
        requestFor(voter._id, { role: 'recinto_coordinator', recintoScopes: [voter.recintoKey] }),
      );
      expect(user.role).toBe('recinto_coordinator');
    });

    it('never lets a general coordinator appoint another general coordinator, creating nothing', async () => {
      const admin = await createTestUser({ role: 'general_coordinator' });
      const voter = await voterAt(6);
      const [usersBefore, peopleBefore] = [
        await UserModel.countDocuments(),
        await PersonModel.countDocuments(),
      ];

      await expect(
        appointCoordinator(
          actorWith(admin),
          requestFor(voter._id, { role: 'general_coordinator', recintoScopes: [] }),
        ),
      ).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        message: 'No puede nombrar este rol.',
      });
      await expect(UserModel.countDocuments()).resolves.toBe(usersBefore);
      await expect(PersonModel.countDocuments()).resolves.toBe(peopleBefore);
    });
  });

  it('records the appointment in the audit log, with the cédula masked', async () => {
    const admin = await createTestUser({ role: 'superadmin' });
    const voter = await voterAt(7);

    const user = await appointCoordinator(
      actorWith(admin),
      requestFor(voter._id, { role: 'recinto_coordinator', recintoScopes: [voter.recintoKey] }),
    );

    const entries = await AuditLogModel.find().lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: admin._id,
      action: 'user.appointed',
      entity: 'user',
      entityId: user._id,
      ip: '203.0.113.7',
    });
    const masked = `${voter._id.slice(0, 3)}-*******-${voter._id.slice(-1)}`;
    expect(entries[0]?.summary).toBe(`Nombró a ${masked} como coordinador(a) de recinto.`);
    expect(entries[0]?.summary).not.toContain(voter._id);
  });
});
