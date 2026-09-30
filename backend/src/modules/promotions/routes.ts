import {
  leadersQuerySchema,
  manualPromotionRequestSchema,
  nominationRequestSchema,
  type LeadersQuery,
  type LeadersResponse,
  type ManualPromotionRequest,
  type NominationRequest,
  type NominationResponse,
} from '@heribertova/shared';
import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import { actorOf } from '../audit/service';
import { demoteManual, listLeaders, nominate, promoteManual } from './service';

const personIdParamsSchema = z.object({ personId: objectIdSchema });

export function createPromotionRoutes(): ApiRoute[] {
  return [
    {
      method: 'get',
      path: '/leaders',
      access: 'authenticated',
      handlers: [
        validate({ query: leadersQuerySchema }),
        async (req, res) => {
          const query = req.query as unknown as LeadersQuery;
          res.json((await listLeaders(actorOf(req), query)) satisfies LeadersResponse);
        },
      ],
    },
    {
      method: 'post',
      path: '/promotions/nominations',
      access: 'leaders.nominate',
      handlers: [
        validate({ body: nominationRequestSchema }),
        async (req, res) => {
          const result = await nominate(actorOf(req), req.body as NominationRequest);
          res.status(201).json(result satisfies NominationResponse);
        },
      ],
    },
    {
      method: 'post',
      path: '/promotions/:personId/promote',
      access: 'leaders.promoteManual',
      handlers: [
        validate({ params: personIdParamsSchema, body: manualPromotionRequestSchema }),
        async (req, res) => {
          const { personId } = req.params as z.infer<typeof personIdParamsSchema>;
          await promoteManual(actorOf(req), personId, (req.body as ManualPromotionRequest).reason);
          res.status(204).end();
        },
      ],
    },
    {
      method: 'post',
      path: '/promotions/:personId/demote',
      access: 'leaders.promoteManual',
      handlers: [
        validate({ params: personIdParamsSchema, body: manualPromotionRequestSchema }),
        async (req, res) => {
          const { personId } = req.params as z.infer<typeof personIdParamsSchema>;
          await demoteManual(actorOf(req), personId, (req.body as ManualPromotionRequest).reason);
          res.status(204).end();
        },
      ],
    },
  ];
}
