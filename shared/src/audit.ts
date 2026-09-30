import { z } from 'zod';

/**
 * What an audit entry records (HERIBERTO_ARCHITECTURE.md §12). Shared so the backend's model, the
 * `GET /api/audit` response and the frontend's filters/labels all agree on the same list; add a
 * value here before an endpoint uses it.
 */
export const AUDIT_ACTIONS = [
  'user.password_reset',
  'user.password_changed',
  'user.superadmin_created',
  'user.appointed',
  'user.updated',
  'user.unlocked',
  'person.created',
  'person.updated',
  'person.deleted',
  'person.photo_uploaded',
  'person.nominated',
  'person.promoted',
  'person.demoted',
  'settings.updated',
  'export.people',
  'export.recintos',
  'export.leaders',
  'import.uploaded',
  'import.applied',
  'import.discarded',
  'backup.created',
] as const;
export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof auditActionSchema>;

/** The kind of record an audited action touched. */
export const AUDIT_ENTITIES = ['user', 'person', 'settings', 'export', 'import', 'backup'] as const;
export const auditEntitySchema = z.enum(AUDIT_ENTITIES);
export type AuditEntity = z.infer<typeof auditEntitySchema>;
