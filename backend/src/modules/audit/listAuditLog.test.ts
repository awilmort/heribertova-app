import type { AuditLogQuery } from '@heribertova/shared';
import mongoose, { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../../test/database';
import { createTestUser } from '../../../test/users';
import { AuditLogModel } from './model';
import { audit, type Actor } from './service';
import { listAuditLog } from './listAuditLog';

/** Pins `summary`'s entry to an exact instant, so ordering assertions never depend on two calls to
 * `new Date()` landing in different milliseconds. */
function setEntryTime(summary: string, at: string): Promise<unknown> {
  return AuditLogModel.updateOne({ summary }, { $set: { at: new Date(at) } });
}

useTestDatabase();

function query(overrides: Partial<AuditLogQuery> = {}): AuditLogQuery {
  return { page: 1, pageSize: 20, ...overrides };
}

async function actor(): Promise<Actor> {
  return { user: await createTestUser(), ip: '203.0.113.7' };
}

async function record(who: Actor, overrides: Partial<Parameters<typeof audit>[1]> = {}) {
  await mongoose.connection.transaction((session) =>
    audit(
      who,
      {
        action: 'user.unlocked',
        entity: 'user',
        entityId: new Types.ObjectId(),
        summary: 'Desbloqueó la cuenta de 001-*******-2.',
        ...overrides,
      },
      session,
    ),
  );
}

describe('listAuditLog', () => {
  it('returns entries newest first, with the actor resolved to their username', async () => {
    const who = await actor();
    await record(who, { summary: 'primero' });
    await record(who, { summary: 'segundo' });
    await setEntryTime('primero', '2026-01-01T00:00:00.000Z');
    await setEntryTime('segundo', '2026-01-02T00:00:00.000Z');

    const page = await listAuditLog(query());

    expect(page.items.map((item) => item.summary)).toEqual(['segundo', 'primero']);
    expect(page.items[0]).toMatchObject({ actorUsername: who.user.username, ip: '203.0.113.7' });
    expect(page.total).toBe(2);
  });

  it('shows "—" when the actor account no longer exists', async () => {
    const who = await actor();
    await record(who);
    await who.user.deleteOne();

    const page = await listAuditLog(query());

    expect(page.items[0]?.actorUsername).toBe('—');
  });

  it('filters by action', async () => {
    const who = await actor();
    await record(who, { action: 'user.unlocked' });
    await record(who, { action: 'user.password_reset', summary: 'reset' });

    const page = await listAuditLog(query({ action: 'user.password_reset' }));

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.summary).toBe('reset');
  });

  it('filters by entity', async () => {
    const who = await actor();
    await record(who, { entity: 'user' });
    await record(who, { entity: 'settings', action: 'settings.updated', summary: 'consulta' });

    const page = await listAuditLog(query({ entity: 'settings' }));

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.summary).toBe('consulta');
  });

  it('filters by an inclusive day range', async () => {
    const who = await actor();
    await record(who, { summary: 'antes' });
    await record(who, { summary: 'en rango' });
    await record(who, { summary: 'después' });

    await setEntryTime('antes', '2026-01-01T00:00:00.000Z');
    await setEntryTime('en rango', '2026-01-05T12:00:00.000Z');
    await setEntryTime('después', '2026-01-10T00:00:00.000Z');

    const page = await listAuditLog(query({ from: '2026-01-02', to: '2026-01-09' }));

    expect(page.items.map((item) => item.summary)).toEqual(['en rango']);
  });

  it('paginates', async () => {
    const who = await actor();
    for (let i = 0; i < 5; i += 1) {
      await record(who, { summary: `entrada ${i}` });
      await setEntryTime(`entrada ${i}`, `2026-01-0${i + 1}T00:00:00.000Z`);
    }

    const page = await listAuditLog(query({ page: 2, pageSize: 2 }));

    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(5);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(2);
  });
});
