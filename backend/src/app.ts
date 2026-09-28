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
import type { TurnstileVerifier } from './modules/auth/turnstile';
import { API_PREFIX, buildApiRouter } from './routing/apiRoute';
import { apiRoutes } from './routing/registry';

export type AppConfig = Pick<
  Env,
  | 'TRUST_PROXY'
  | 'RATE_LIMIT_MAX'
  | 'RATE_LIMIT_WINDOW_MS'
  | 'LOGIN_RATE_LIMIT_MAX'
  | 'APP_ORIGIN'
  | 'TOTP_ENC_KEY'
>;

/** External services the app talks to, injected so tests can stand them in without an emulator. */
export interface AppDependencies {
  /** Whether object storage answers (index.ts: HeadBucket on the media bucket). */
  pingS3: () => Promise<boolean>;
  /** Cloudflare Turnstile check on login (index.ts: siteverify with TURNSTILE_SECRET_KEY). */
  verifyTurnstile: TurnstileVerifier;
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
