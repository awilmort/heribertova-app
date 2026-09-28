import { model, Schema, type Types } from 'mongoose';

/**
 * What an audit entry records. Plan 4.3 owns the audit log (viewer, a route-walking test that every
 * mutating endpoint audits) and adds the actions of the endpoints it covers.
 */
export const AUDIT_ACTIONS = [
  'user.password_reset',
  'user.password_changed',
  'user.superadmin_created',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** The kind of record an audited action touched. */
export const AUDIT_ENTITIES = ['user'] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

/** Audit entries are kept for a year, then MongoDB's TTL monitor deletes them. */
export const AUDIT_RETENTION_SECONDS = 365 * 24 * 60 * 60;

/** Who did what to which record, from where and when (HERIBERTO_ARCHITECTURE.md §5, §12). */
export interface AuditLog {
  _id: Types.ObjectId;
  actorUserId: Types.ObjectId;
  action: AuditAction;
  entity: AuditEntity;
  entityId: Types.ObjectId;
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
    entityId: { type: Schema.Types.ObjectId, required: true },
    summary: { type: String, required: true },
    ip: { type: String, default: null },
    at: { type: Date, required: true },
  },
  { collection: 'auditLogs', versionKey: false },
);

auditLogSchema.index({ at: 1 }, { expireAfterSeconds: AUDIT_RETENTION_SECONDS });

export const AuditLogModel = model<AuditLog>('AuditLog', auditLogSchema);
