import { z } from 'zod';
import { booleanQueryParamSchema } from './pagination';
import { docStatusSchema, personStatusSchema } from '../personStatus';
import { personScopeSchema } from './people';
import { leaderLevelSchema } from './promotions';

/**
 * `GET /api/exports/people.xlsx` (plan 6.4): the same filters `/equipo` (`status`, `docStatus`,
 * `q`) and `/lideres` (`level`) already use, plus `/reportes`'s own filters (plan 8.2), so one
 * export covers every page's "Exportar Excel" button. There is no pagination: every matching row
 * streams, up to the export's row cap.
 */
export const exportPeopleQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  status: personStatusSchema.optional(),
  docStatus: docStatusSchema.optional(),
  level: leaderLevelSchema.optional(),
  sector: z.string().trim().min(1).optional(),
  recintoKey: z.string().trim().min(1).optional(),
  colegioId: z.coerce.number().int().optional(),
  missingCedulaPhoto: booleanQueryParamSchema.optional(),
  scope: personScopeSchema.optional(),
});
export type ExportPeopleQuery = z.infer<typeof exportPeopleQuerySchema>;
