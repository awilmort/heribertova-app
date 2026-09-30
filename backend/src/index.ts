import { createApp } from './app';
import { loadEnv } from './config/env';
import { connectMongo, disconnectMongo } from './db/mongo';
import { createLogger } from './lib/logger';
import { createTurnstileVerifier } from './modules/auth/turnstile';
import { failInterruptedValidations } from './modules/imports/service';
import { createS3ObjectStorage } from './storage/objectStorage';
import { createS3Client, pingBucket } from './storage/s3';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);

await connectMongo(env.MONGODB_URI, logger);
const s3 = createS3Client(env);

// The API is now an importer too (plan 9.1): any import a previous process left `validating`
// when it died is not still running, so it is safe to fail it and free its file for a retry.
for (const interrupted of await failInterruptedValidations()) {
  logger.warn({ importId: interrupted.id }, 'Marked voter import failed: interrupted by a restart');
}

const server = createApp(env, logger, {
  pingS3: () => pingBucket(s3, env.S3_MEDIA_BUCKET),
  verifyTurnstile: createTurnstileVerifier(env.TURNSTILE_SECRET_KEY, logger),
  objectStorage: createS3ObjectStorage(s3, env.S3_MEDIA_BUCKET),
  importsObjectStorage: createS3ObjectStorage(s3, env.S3_IMPORTS_BUCKET),
  backupObjectStorage: createS3ObjectStorage(s3, env.S3_BACKUP_BUCKET),
}).listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    s3.destroy();
    disconnectMongo()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error({ err }, 'Error while disconnecting MongoDB');
        process.exit(1);
      });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
