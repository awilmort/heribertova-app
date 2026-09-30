import { z } from 'zod';

/**
 * `/admin/respaldos` (plan 9.3, amended: exactly one backup is kept, replaced whenever a new one is
 * made — no daily cron, no dated history; the superadmin triggers it manually). Every collection
 * except `sessions` is dumped as gzipped NDJSON.
 */
export const backupCollectionSchema = z.object({
  name: z.string(),
  count: z.number(),
  bytes: z.number(),
  sha256: z.string(),
});

export const backupManifestSchema = z.object({
  createdAt: z.string(),
  collections: z.array(backupCollectionSchema),
});
export type BackupManifest = z.infer<typeof backupManifestSchema>;

/** `GET /api/backups/status`: the admin widget's last-backup time and the Atlas M0 storage budget
 * (HERIBERTO_ARCHITECTURE.md §11), warning at 80%. */
export const backupStatusResponseSchema = z.object({
  lastBackup: backupManifestSchema.nullable(),
  storage: z.object({
    bytes: z.number(),
    limitBytes: z.number(),
    percentUsed: z.number(),
    warn: z.boolean(),
  }),
});
export type BackupStatusResponse = z.infer<typeof backupStatusResponseSchema>;
