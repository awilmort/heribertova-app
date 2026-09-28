import express from 'express';
import helmet from 'helmet';
import type { Env } from './config/env';
import type { Logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { globalRateLimit } from './middleware/rateLimit';
import { requestLogger } from './middleware/requestLogger';
import { pingMongo } from './db/mongo';
import { createHealthRouter } from './modules/health/routes';

export type AppConfig = Pick<Env, 'TRUST_PROXY' | 'RATE_LIMIT_MAX' | 'RATE_LIMIT_WINDOW_MS'>;

/** External services the app talks to, injected so tests can stand them in without an emulator. */
export interface AppDependencies {
  /** Whether object storage answers (index.ts: HeadBucket on the media bucket). */
  pingS3: () => Promise<boolean>;
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp(
  config: AppConfig,
  logger: Logger,
  dependencies: AppDependencies,
): express.Express {
  const app = express();

  app.set('trust proxy', config.TRUST_PROXY);
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(globalRateLimit({ windowMs: config.RATE_LIMIT_WINDOW_MS, max: config.RATE_LIMIT_MAX }));
  app.use(express.json({ limit: '100kb' }));

  // Every route lives under /api: the frontend forwards /api/* here (same-origin rewrite).
  app.use('/api', createHealthRouter({ mongo: pingMongo, s3: dependencies.pingS3 }));

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
