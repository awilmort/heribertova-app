import type { AppConfig, AppDependencies } from '../app';
import { pingMongo } from '../db/mongo';
import { createAuthRoutes } from '../modules/auth/routes';
import { createHealthRoutes } from '../modules/health/routes';
import { createMeRoutes } from '../modules/me/routes';
import { createUserRoutes } from '../modules/users/routes';
import type { ApiRoute } from './apiRoute';

/**
 * Every route the API serves: the app mounts exactly this list. A new route goes in its module's
 * `routes.ts` and is added here; the authorization matrix test (`authorizationMatrix.test.ts`) then
 * fails until the route has a case there too.
 */
export function apiRoutes(config: AppConfig, dependencies: AppDependencies): ApiRoute[] {
  return [
    ...createHealthRoutes({ mongo: pingMongo, s3: dependencies.pingS3 }),
    ...createAuthRoutes({
      verifyTurnstile: dependencies.verifyTurnstile,
      loginRateLimitMax: config.LOGIN_RATE_LIMIT_MAX,
      totpKey: config.TOTP_ENC_KEY,
    }),
    ...createMeRoutes(),
    ...createUserRoutes(),
  ];
}
