import {
  setupSuperadminRequestSchema,
  type SetupStatusResponse,
  type SetupSuperadminRequest,
} from '@heribertova/shared';
import { AppError } from '../../lib/errors';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import { UserModel } from '../users/model';
import { setupSuperadmin, SuperadminSetupError } from '../users/superadmin';

export interface SetupRoutesOptions {
  /** TOTP_ENC_KEY: encrypts the fresh superadmin's TOTP secret. */
  totpKey: Buffer;
}

/**
 * `/configuracion-inicial` (plan 3.3): the one-time, unauthenticated page that creates the
 * superadmin, so the first deploy needs neither shell access to the server nor an imported padrón.
 * Both routes are public — there is no one to authenticate as before this runs — but `POST` only
 * ever succeeds once: the moment a superadmin exists, `GET /status` reports `needed: false` and
 * every further `POST` refuses (`setupSuperadmin`'s own check, backed by the unique
 * `one_superadmin` index against a concurrent attempt).
 */
export function createSetupRoutes({ totpKey }: SetupRoutesOptions): ApiRoute[] {
  return [
    {
      method: 'get',
      path: '/setup/status',
      access: 'public',
      handlers: [
        async (_req, res) => {
          const needed = !(await UserModel.exists({ role: 'superadmin' }));
          res.json({ needed } satisfies SetupStatusResponse);
        },
      ],
    },
    {
      method: 'post',
      path: '/setup/superadmin',
      access: 'public',
      handlers: [
        validate({ body: setupSuperadminRequestSchema }),
        async (req, res) => {
          try {
            await setupSuperadmin(req.body as SetupSuperadminRequest, totpKey);
          } catch (err) {
            if (err instanceof SuperadminSetupError) {
              throw err.field
                ? new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
                    [`body.${err.field}`]: [err.message],
                  })
                : new AppError(403, 'FORBIDDEN', err.message);
            }
            throw err;
          }
          res.status(204).end();
        },
      ],
    },
  ];
}
