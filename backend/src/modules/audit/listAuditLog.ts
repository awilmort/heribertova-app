import type { AuditLogQuery, AuditLogResponse } from '@heribertova/shared';
import type { QueryFilter } from 'mongoose';
import { UserModel } from '../users/model';
import { AuditLogModel, type AuditLog } from './model';

/** The UTC instant "YYYY-MM-DD" begins/ends. Good enough for a filter widget, unlike `birthDate`
 * or the campaign-day boundary, neither of which this touches. */
function startOfDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
function endOfDay(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

/** `GET /api/audit` (plan 4.3): a filtered, paginated page of the audit trail, newest first, with
 * each entry's actor resolved to their username for display. */
export async function listAuditLog(query: AuditLogQuery): Promise<AuditLogResponse> {
  const filter: QueryFilter<AuditLog> = {};
  if (query.action) filter.action = query.action;
  if (query.entity) filter.entity = query.entity;
  if (query.from || query.to) {
    filter.at = {
      ...(query.from ? { $gte: startOfDay(query.from) } : {}),
      ...(query.to ? { $lte: endOfDay(query.to) } : {}),
    };
  }

  const skip = (query.page - 1) * query.pageSize;
  const [entries, total] = await Promise.all([
    AuditLogModel.find(filter).sort({ at: -1 }).skip(skip).limit(query.pageSize).lean(),
    AuditLogModel.countDocuments(filter),
  ]);

  const actors = await UserModel.find({ _id: { $in: entries.map((entry) => entry.actorUserId) } })
    .select({ username: 1 })
    .lean();
  const usernameById = new Map(actors.map((actor) => [actor._id.toHexString(), actor.username]));

  return {
    items: entries.map((entry) => ({
      id: entry._id.toHexString(),
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId?.toHexString() ?? null,
      summary: entry.summary,
      actorUsername: usernameById.get(entry.actorUserId.toHexString()) ?? '—',
      ip: entry.ip,
      at: entry.at.toISOString(),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}
