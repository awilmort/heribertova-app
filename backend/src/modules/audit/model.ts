import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  type AuditAction,
  type AuditEntity,
} from '@heribertova/shared';
import { model, Schema, type Types } from 'mongoose';

export type { AuditAction, AuditEntity };

/** Audit entries are kept for a year, then MongoDB's TTL monitor deletes them. */
export const AUDIT_RETENTION_SECONDS = 365 * 24 * 60 * 60;

/** Who did what to which record, from where and when (HERIBERTO_ARCHITECTURE.md §5, §12). */
export interface AuditLog {
  _id: Types.ObjectId;
  actorUserId: Types.ObjectId;
  action: AuditAction;
  entity: AuditEntity;
  /** The record's id, when the action has a single Mongo document as its subject (null for
   * account-wide actions like a settings change or a backup). */
  entityId: Types.ObjectId | null;
  /** Human-readable, in Spanish, with cédulas masked ("001-*******-2"). */
  summary: string;
  ip: string | null;
  at: Date;
}

const auditLogSchema = new Schema<AuditLog>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entity: { type: String, enum: AUDIT_ENTITIES, required: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    summary: { type: String, required: true },
    ip: { type: String, default: null },
    at: { type: Date, required: true },
  },
  { collection: 'auditLogs', versionKey: false },
);

auditLogSchema.index({ at: 1 }, { expireAfterSeconds: AUDIT_RETENTION_SECONDS });
// A user's actions over time: the daily export quota (exports/service.ts) counts on it.
auditLogSchema.index({ actorUserId: 1, action: 1, at: 1 });

export const AuditLogModel = model<AuditLog>('AuditLog', auditLogSchema);
