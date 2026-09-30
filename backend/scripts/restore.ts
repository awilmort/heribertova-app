// Restores the single kept backup (plan 9.3) into a target MongoDB database. The target is always
// given explicitly and is the only database this process ever connects to — there is no risk of it
// silently overwriting the database `.env`'s MONGODB_URI points at.
//
//   npm run backup:restore --workspace=backend -- --target-uri mongodb://localhost:27017/heribertova_restore
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env';
import { connectMongo, disconnectMongo } from '../src/db/mongo';
import { createLogger } from '../src/lib/logger';
import { decodeLines } from '../src/modules/backups/ndjson';
import { BACKUP_PREFIX, MANIFEST_KEY } from '../src/modules/backups/service';
import { createS3ObjectStorage, streamToBuffer } from '../src/storage/objectStorage';
import { createS3Client } from '../src/storage/s3';

const USAGE = 'Usage: npm run backup:restore --workspace=backend -- --target-uri <mongodb-uri>';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { 'target-uri': { type: 'string' } },
  strict: true,
});
if (!values['target-uri']) {
  console.error(USAGE);
  process.exit(2);
}
const targetUri = values['target-uri'];

const env = loadEnv();
const logger = createLogger('warn');
const s3 = createS3Client(env);
const objectStorage = createS3ObjectStorage(s3, env.S3_BACKUP_BUCKET);

const keys = await objectStorage.list(BACKUP_PREFIX);
if (!keys.includes(MANIFEST_KEY)) {
  console.error(`No backup found at s3://${env.S3_BACKUP_BUCKET}/${BACKUP_PREFIX}`);
  s3.destroy();
  process.exit(1);
}

const manifest = JSON.parse(
  (await streamToBuffer(await objectStorage.getStream(MANIFEST_KEY))).toString('utf8'),
) as { createdAt: string; collections: { name: string; count: number }[] };
console.log(`Backup from ${manifest.createdAt}: ${manifest.collections.length} collections`);

await connectMongo(targetUri, logger);
const db = mongoose.connection.db;
if (!db) throw new Error('MongoDB is not connected');

let failed = false;
for (const { name, count } of manifest.collections) {
  const gz = await streamToBuffer(
    await objectStorage.getStream(`${BACKUP_PREFIX}${name}.ndjson.gz`),
  );
  const docs = decodeLines(gunzipSync(gz).toString('utf8'));

  await db.collection(name).deleteMany({});
  if (docs.length > 0) await db.collection(name).insertMany(docs as object[], { ordered: false });

  const restoredCount = await db.collection(name).countDocuments();
  const ok = restoredCount === count;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}: expected ${count}, restored ${restoredCount}`);
}

await disconnectMongo();
s3.destroy();
process.exitCode = failed ? 1 : 0;
