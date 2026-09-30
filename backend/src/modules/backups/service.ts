import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { BackupManifest } from '@heribertova/shared';
import mongoose from 'mongoose';
import { streamToBuffer, type ObjectStorage } from '../../storage/objectStorage';
import { encodeLine } from './ndjson';

/** Where the single kept backup lives (plan 9.3, amended scope: one slot, replaced whenever a new
 * backup is made — no dated prefixes, no lifecycle rule needed to prune old ones). */
export const BACKUP_PREFIX = 'backup/';
export const MANIFEST_KEY = `${BACKUP_PREFIX}manifest.json`;

/** Never backed up: session tokens are short-lived and a backup has no business carrying live
 * session secrets around (HERIBERTO_ARCHITECTURE.md §11). */
const EXCLUDED_COLLECTIONS = new Set(['sessions']);

function requireDb() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  return db;
}

async function collectionNames(): Promise<string[]> {
  const collections = await requireDb().listCollections().toArray();
  return collections
    .map((collection) => collection.name)
    .filter((name) => !EXCLUDED_COLLECTIONS.has(name));
}

async function dumpCollection(name: string): Promise<{ gz: Buffer; count: number }> {
  const cursor = requireDb().collection(name).find();
  const lines: string[] = [];
  let count = 0;
  for await (const doc of cursor) {
    lines.push(encodeLine(doc));
    count++;
  }
  return { gz: gzipSync(Buffer.from(lines.join(''), 'utf8')), count };
}

/**
 * `POST /api/backups` (superadmin, manual trigger only — plan 9.3's amended scope drops the daily
 * GitHub Actions cron and the HMAC-signed endpoint it called; the superadmin now makes a backup from
 * `/admin/respaldos` whenever they choose). Dumps every collection except `sessions` as gzipped
 * NDJSON and replaces the single kept backup: the previous objects are deleted only after every
 * collection has dumped successfully, and the manifest is written last, so a failure partway through
 * never destroys the previous backup and never leaves a partial one that `getBackupManifest` (or a
 * restore) would mistake for complete.
 */
export async function createBackup(objectStorage: ObjectStorage): Promise<BackupManifest> {
  const names = await collectionNames();
  const dumps = await Promise.all(
    names.map(async (name) => ({ name, ...(await dumpCollection(name)) })),
  );

  const manifest: BackupManifest = {
    createdAt: new Date().toISOString(),
    collections: dumps.map(({ name, gz, count }) => ({
      name,
      count,
      bytes: gz.length,
      sha256: createHash('sha256').update(gz).digest('hex'),
    })),
  };

  const previousKeys = await objectStorage.list(BACKUP_PREFIX);
  for (const key of previousKeys) await objectStorage.delete(key);

  for (const { name, gz } of dumps) {
    await objectStorage.put(`${BACKUP_PREFIX}${name}.ndjson.gz`, gz, 'application/gzip');
  }
  await objectStorage.put(MANIFEST_KEY, Buffer.from(JSON.stringify(manifest)), 'application/json');

  return manifest;
}

/** The last backup's manifest, or null if none has been made yet. */
export async function getBackupManifest(
  objectStorage: ObjectStorage,
): Promise<BackupManifest | null> {
  const keys = await objectStorage.list(BACKUP_PREFIX);
  if (!keys.includes(MANIFEST_KEY)) return null;
  const buffer = await streamToBuffer(await objectStorage.getStream(MANIFEST_KEY));
  return JSON.parse(buffer.toString('utf8')) as BackupManifest;
}

/** Atlas M0's hard cap (HERIBERTO_ARCHITECTURE.md §11): the admin widget warns at 80%. */
const ATLAS_M0_LIMIT_BYTES = 512 * 1024 * 1024;

export interface StorageUsage {
  bytes: number;
  limitBytes: number;
  percentUsed: number;
  warn: boolean;
}

export async function getStorageUsage(): Promise<StorageUsage> {
  // `Db.stats()` is typed as a bare `Document` (an index signature of `any`) by the driver; the two
  // fields this needs are documented and stable, so they are asserted rather than re-validated here.
  const stats = (await requireDb().stats()) as { storageSize: number; indexSize: number };
  const bytes = stats.storageSize + stats.indexSize;
  const percentUsed = bytes / ATLAS_M0_LIMIT_BYTES;
  return { bytes, limitBytes: ATLAS_M0_LIMIT_BYTES, percentUsed, warn: percentUsed >= 0.8 };
}
