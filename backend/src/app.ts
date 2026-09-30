import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import type { Env } from './config/env';
import type { Logger } from './lib/logger';
import { csrfGuard } from './middleware/csrf';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { globalRateLimit } from './middleware/rateLimit';
import { requestLogger } from './middleware/requestLogger';
import { API_PREFIX, buildApiRouter } from './routing/apiRoute';
import { apiRoutes } from './routing/registry';
import type { ObjectStorage } from './storage/objectStorage';

export type AppConfig = Pick<
  Env,
  | 'TRUST_PROXY'
  | 'RATE_LIMIT_MAX'
  | 'RATE_LIMIT_WINDOW_MS'
  | 'LOGIN_RATE_LIMIT_MAX'
  | 'VOTER_LOOKUP_DAILY_QUOTA'
  | 'EXPORTS_DAILY_QUOTA'
  | 'APP_ORIGIN'
  | 'TOTP_ENC_KEY'
>;

/** External services the app talks to, injected so tests can stand them in without an emulator. */
export interface AppDependencies {
  /** Whether object storage answers (index.ts: HeadBucket on the media bucket). */
  pingS3: () => Promise<boolean>;
  /** Member photos (plan 5.2): the media bucket, behind the small interface people/photos.ts uses. */
  objectStorage: ObjectStorage;
  /** Voter files (plan 9.1): the imports bucket, behind the same small interface. */
  importsObjectStorage: ObjectStorage;
  /** The single kept database backup (plan 9.3): the backups bucket, behind the same interface. */
  backupObjectStorage: ObjectStorage;
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
  app.use(csrfGuard(config.APP_ORIGIN));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  // Every route is declared in the registry, with its access (public, authenticated, or a permission).
  app.use(API_PREFIX, buildApiRouter(apiRoutes(config, dependencies)));

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
