import type { Request } from 'express';
import mongoose, { Types } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { createTestUser } from '../../../test/users';
import { AUDIT_RETENTION_SECONDS, AuditLogModel } from './model';
import { actorOf, audit, type Actor, type AuditEvent } from './service';

useTestDatabase();

beforeAll(async () => {
  await AuditLogModel.createIndexes();
});

const event: AuditEvent = {
  action: 'user.password_reset',
  entity: 'user',
  entityId: new Types.ObjectId(),
  summary: 'Restableció a la fecha de nacimiento la contraseña de 00112345672.',
};

async function actor(): Promise<Actor> {
  return { user: await createTestUser(), ip: '203.0.113.7' };
}

describe('audit', () => {
  it('records who did what to which record, from where and when', async () => {
    const who = await actor();
    const before = Date.now();

    await mongoose.connection.transaction((session) => audit(who, event, session));

    const [entry, ...others] = await AuditLogModel.find().lean();
    expect(others).toEqual([]);
    expect(entry).toMatchObject({
      actorUserId: who.user._id,
      action: 'user.password_reset',
      entity: 'user',
      entityId: event.entityId,
      ip: '203.0.113.7',
    });
    expect(entry?.at.getTime()).toBeGreaterThanOrEqual(before);
    expect(entry?.at.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('masks every cédula in the summary', async () => {
    await mongoose.connection.transaction(async (session) =>
      audit(await actor(), { ...event, summary: 'De 00112345672 a 402-1234567-8.' }, session),
    );
    const entry = await AuditLogModel.findOne().lean();
    expect(entry?.summary).toBe('De 001-*******-2 a 402-*******-8.');
  });

  it('is rolled back with the change it describes', async () => {
    const who = await actor();
    await expect(
      mongoose.connection.transaction(async (session) => {
        await audit(who, event, session);
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');
    await expect(AuditLogModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects an unknown action', async () => {
    await expect(
      mongoose.connection.transaction(async (session) =>
        audit(await actor(), { ...event, action: 'user.deleted' as never }, session),
      ),
    ).rejects.toThrow(/action/);
  });

  it('keeps entries for a year (TTL index on `at`)', async () => {
    expect(AUDIT_RETENTION_SECONDS).toBe(365 * 24 * 60 * 60);
    const indexes = await AuditLogModel.collection.indexes();
    expect(indexes.find((index) => index.key.at === 1)?.expireAfterSeconds).toBe(
      AUDIT_RETENTION_SECONDS,
    );
  });
});

describe('actorOf', () => {
  it('is the logged-in user and the client IP of the request', async () => {
    const user = await createTestUser();
    expect(actorOf({ user, ip: '198.51.100.4' } as Request)).toEqual({
      user,
      ip: '198.51.100.4',
    });
  });

  it('has a null IP when the request has none', async () => {
    const user = await createTestUser();
    expect(actorOf({ user, ip: undefined } as Request).ip).toBeNull();
  });
});
