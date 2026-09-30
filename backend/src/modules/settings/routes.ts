import { promotionSettingsSchema, type PromotionSettings } from '@heribertova/shared';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import { actorOf } from '../audit/service';
import { getPromotionSettings, updatePromotionSettings } from './service';

export function createSettingsRoutes(): ApiRoute[] {
  return [
    {
      // Readable by anyone logged in (not `settings.manage`): the nomination dialog (plan 6.3)
      // needs `nominationMinInitialMembers` for every role that can nominate, not just the
      // superadmin who may change it. The numbers aren't sensitive; only PUT is superadmin-only.
      method: 'get',
      path: '/settings/promotion',
      access: 'authenticated',
      handlers: [
        async (req, res) => {
          res.json((await getPromotionSettings()) satisfies PromotionSettings);
        },
      ],
    },
    {
      method: 'put',
      path: '/settings/promotion',
      access: 'settings.manage',
      handlers: [
        validate({ body: promotionSettingsSchema }),
        async (req, res) => {
          const updated = await updatePromotionSettings(
            actorOf(req),
            req.body as PromotionSettings,
          );
          res.json(updated satisfies PromotionSettings);
        },
      ],
    },
  ];
}
