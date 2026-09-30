import { z } from 'zod';
import { auditActionSchema, auditEntitySchema } from '../audit';
import { pagedResponseSchema, paginationQuerySchema } from './pagination';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_ONLY_MESSAGE = 'Use el formato AAAA-MM-DD.';

/** `GET /api/audit` (plan 4.3): filters by action, entity and an inclusive day range. */
export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: auditActionSchema.optional(),
  entity: auditEntitySchema.optional(),
  /** "YYYY-MM-DD", inclusive. */
  from: z.string().regex(DATE_ONLY, DATE_ONLY_MESSAGE).optional(),
  to: z.string().regex(DATE_ONLY, DATE_ONLY_MESSAGE).optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogEntrySchema = z.object({
  id: z.string(),
  action: auditActionSchema,
  entity: auditEntitySchema,
  entityId: z.string().nullable(),
  summary: z.string(),
  /** The cédula of whoever performed the action; "—" if their account no longer exists. */
  actorUsername: z.string(),
  ip: z.string().nullable(),
  at: z.string(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const auditLogResponseSchema = pagedResponseSchema(auditLogEntrySchema);
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>;
