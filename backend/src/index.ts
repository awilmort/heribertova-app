import { createApp } from './app';
import { loadEnv } from './config/env';
import { connectMongo, disconnectMongo } from './db/mongo';
import { createLogger } from './lib/logger';
import { createTurnstileVerifier } from './modules/auth/turnstile';
import { createS3Client, pingBucket } from './storage/s3';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);

await connectMongo(env.MONGODB_URI, logger);
const s3 = createS3Client(env);

const server = createApp(env, logger, {
  pingS3: () => pingBucket(s3, env.S3_MEDIA_BUCKET),
  verifyTurnstile: createTurnstileVerifier(env.TURNSTILE_SECRET_KEY, logger),
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
