import type { AppConfig, AppDependencies } from '../app';
import { pingMongo } from '../db/mongo';
import { createAuditRoutes } from '../modules/audit/routes';
import { createAuthRoutes } from '../modules/auth/routes';
import { createBackupRoutes } from '../modules/backups/routes';
import { createDashboardRoutes } from '../modules/dashboards/routes';
import { createExportRoutes } from '../modules/exports/routes';
import { createHealthRoutes } from '../modules/health/routes';
import { createImportRoutes } from '../modules/imports/routes';
import { createMeRoutes } from '../modules/me/routes';
import { createPeopleRoutes } from '../modules/people/routes';
import { createPromotionRoutes } from '../modules/promotions/routes';
import { createRecintoRoutes } from '../modules/recintos/routes';
import { createSettingsRoutes } from '../modules/settings/routes';
import { createUserRoutes } from '../modules/users/routes';
import { createVoterRoutes } from '../modules/voters/routes';
import type { ApiRoute } from './apiRoute';

/** Every route the API serves: the app mounts exactly this list. A new route goes in its module's
 * `routes.ts` and is added here. */
export function apiRoutes(config: AppConfig, dependencies: AppDependencies): ApiRoute[] {
  return [
    ...createHealthRoutes({ mongo: pingMongo, s3: dependencies.pingS3 }),
    ...createAuthRoutes({
      loginRateLimitMax: config.LOGIN_RATE_LIMIT_MAX,
      totpKey: config.TOTP_ENC_KEY,
    }),
    ...createMeRoutes(),
    ...createDashboardRoutes(),
    ...createUserRoutes(),
    ...createVoterRoutes({ voterLookupDailyQuota: config.VOTER_LOOKUP_DAILY_QUOTA }),
    ...createAuditRoutes(),
    ...createPeopleRoutes({ objectStorage: dependencies.objectStorage }),
    ...createImportRoutes({ objectStorage: dependencies.importsObjectStorage }),
    ...createPromotionRoutes(),
    ...createRecintoRoutes(),
    ...createSettingsRoutes(),
    ...createExportRoutes({ exportsDailyQuota: config.EXPORTS_DAILY_QUOTA }),
    ...createBackupRoutes({ objectStorage: dependencies.backupObjectStorage }),
  ];
}
