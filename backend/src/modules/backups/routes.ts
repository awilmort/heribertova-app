import type { BackupManifest, BackupStatusResponse } from '@heribertova/shared';
import type { ApiRoute } from '../../routing/apiRoute';
import type { ObjectStorage } from '../../storage/objectStorage';
import { actorOf, audit } from '../audit/service';
import { createBackup, getBackupManifest, getStorageUsage } from './service';

export interface BackupRoutesOptions {
  /** The backups bucket (S3_BACKUP_BUCKET), behind the same small interface every bucket uses. */
  objectStorage: ObjectStorage;
}

/** `/admin/respaldos` (superadmin only, plan 9.3): a manual "make a backup now" button plus the
 * last-backup time and Atlas M0 storage usage. */
export function createBackupRoutes({ objectStorage }: BackupRoutesOptions): ApiRoute[] {
  return [
    {
      method: 'get',
      path: '/backups/status',
      access: 'backups.manage',
      handlers: [
        async (_req, res) => {
          const [lastBackup, storage] = await Promise.all([
            getBackupManifest(objectStorage),
            getStorageUsage(),
          ]);
          res.json({ lastBackup, storage } satisfies BackupStatusResponse);
        },
      ],
    },
    {
      method: 'post',
      path: '/backups',
      access: 'backups.manage',
      handlers: [
        async (req, res) => {
          const manifest = await createBackup(objectStorage);
          const totalDocs = manifest.collections.reduce(
            (sum, collection) => sum + collection.count,
            0,
          );
          await audit(
            actorOf(req),
            {
              action: 'backup.created',
              entity: 'backup',
              entityId: null,
              summary: `Creó un respaldo (${manifest.collections.length} colecciones, ${totalDocs} documentos).`,
            },
            null,
          );
          res.status(201).json(manifest satisfies BackupManifest);
        },
      ],
    },
  ];
}
