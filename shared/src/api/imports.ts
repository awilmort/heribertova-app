import { z } from 'zod';

/**
 * Lifecycle of a voter import (HERIBERTO_ARCHITECTURE.md §3.2, plans 2.1 and 9.1). `uploaded` is the
 * browser upload's own first status, before validation starts; the CLI import (2.1) starts straight
 * at `validating`. `failed` imports are never retried automatically.
 */
export const VOTER_IMPORT_STATUSES = [
  'uploaded',
  'validating',
  'staged',
  'applying',
  'applied',
  'failed',
] as const;
export const voterImportStatusSchema = z.enum(VOTER_IMPORT_STATUSES);
export type VoterImportStatus = z.infer<typeof voterImportStatusSchema>;

/** The browser checks this before hashing or uploading (HERIBERTO_IMPLEMENTATION_PLAN.md plan 9.1). */
export const MAX_VOTER_FILE_BYTES = 150 * 1024 * 1024;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, 'Hash inválido.');
const cutSchema = z
  .string()
  .trim()
  .min(1, 'Indique el corte del padrón.')
  .max(50, 'El corte es demasiado largo.');

/**
 * `POST /api/imports/upload-url`: the browser already hashed the file (Web Crypto) and asks where to
 * PUT it. A known hash is rejected as a duplicate before anything is uploaded.
 */
export const importUploadUrlRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  sha256: sha256Schema,
  cut: cutSchema,
});
export type ImportUploadUrlRequest = z.infer<typeof importUploadUrlRequestSchema>;

export const importUploadUrlResponseSchema = z.object({
  uploadUrl: z.string(),
  s3Key: z.string(),
});
export type ImportUploadUrlResponse = z.infer<typeof importUploadUrlResponseSchema>;

/** `POST /api/imports`: the file already sits at `s3Key`; this creates the record and starts
 * validating it in the background. */
export const createImportRequestSchema = z.object({
  s3Key: z.string().min(1),
  sha256: sha256Schema,
  cut: cutSchema,
  fileName: z.string().min(1).max(255),
});
export type CreateImportRequest = z.infer<typeof createImportRequestSchema>;

export const createImportResponseSchema = z.object({
  id: z.string(),
  status: voterImportStatusSchema,
});
export type CreateImportResponse = z.infer<typeof createImportResponseSchema>;

function countWithSamplesSchema<T extends z.ZodType>(sample: T) {
  return z.object({ count: z.number(), samples: z.array(sample) });
}

const rejectedRowSchema = z.object({
  row: z.number(),
  cedula: z.string().nullable(),
  reasons: z.array(z.string()),
});

/** What a voter file would change, computed while it is validated (HERIBERTO_ARCHITECTURE.md §3.2). */
export const voterImportReportSchema = z.object({
  rows: z.number(),
  accepted: z.number(),
  rejected: countWithSamplesSchema(rejectedRowSchema),
  warnings: z.object({ checkDigit: countWithSamplesSchema(z.string()) }),
  totals: z.object({ recintos: z.number(), colegios: z.number(), sectors: z.number() }),
  diff: z.object({
    newVoters: countWithSamplesSchema(z.string()),
    movedRecinto: countWithSamplesSchema(z.string()),
    movedColegio: countWithSamplesSchema(z.string()),
    missing: countWithSamplesSchema(z.string()),
    recintosAdded: z.array(z.string()),
    recintosRemoved: z.array(z.string()),
  }),
  source: z.array(
    z.object({
      idProvincia: z.number(),
      descripcionProvincia: z.string(),
      idMunicipio: z.number(),
      descripcionMunicipio: z.string(),
      codigoCircunscripcion: z.string(),
    }),
  ),
});
export type VoterImportReportDto = z.infer<typeof voterImportReportSchema>;

/** `GET /api/imports/:id` (polled while the file validates) and `GET /api/imports` (plan 9.2's
 * `/admin/padron` history list): one voter import, whichever import core (CLI or this UI) made it. */
export const voterImportSchema = z.object({
  id: z.string(),
  cut: z.string(),
  fileName: z.string(),
  sha256: z.string(),
  status: voterImportStatusSchema,
  /** Rows processed so far, while `status` is `uploaded` or `validating`; null otherwise. */
  progress: z.object({ rowsProcessed: z.number() }).nullable(),
  report: voterImportReportSchema.nullable(),
  failureReason: z.string().nullable(),
  /** The cédula of whoever uploaded it, or null for a CLI import (plan 2.1) or an unknown user. */
  uploadedByUsername: z.string().nullable(),
  appliedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type VoterImportDto = z.infer<typeof voterImportSchema>;

/** `GET /api/imports` (plan 9.2): the import history, newest first. Small enough (one campaign's
 * worth of padrón cuts) that it is never paginated. */
export const voterImportListResponseSchema = z.object({ items: z.array(voterImportSchema) });
export type VoterImportListResponse = z.infer<typeof voterImportListResponseSchema>;
