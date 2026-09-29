import { cedulaSchema, type SectorsResponse, type VoterCard } from '@heribertova/shared';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import type { ApiRoute } from '../../routing/apiRoute';
import { actorOf } from '../audit/service';
import { lookupVoter } from './lookup';
import { createSectorTreeCache } from './sectors';

const cedulaParamsSchema = z.object({ cedula: cedulaSchema });

export interface VoterRoutesOptions {
  voterLookupDailyQuota: number;
}

export function createVoterRoutes({ voterLookupDailyQuota }: VoterRoutesOptions): ApiRoute[] {
  const sectorTree = createSectorTreeCache();
  return [
    {
      method: 'get',
      path: '/voters/:cedula',
      access: 'voters.lookup',
      handlers: [
        validate({ params: cedulaParamsSchema }),
        async (req, res) => {
          const { cedula } = req.params as z.infer<typeof cedulaParamsSchema>;
          const card = await lookupVoter(actorOf(req), cedula, {
            dailyQuota: voterLookupDailyQuota,
          });
          res.json(card satisfies VoterCard);
        },
      ],
    },
    {
      // Filters across the app (members, recintos, reports) need it, whatever the role.
      method: 'get',
      path: '/sectors',
      access: 'authenticated',
      handlers: [
        async (_req, res) => {
          res.json({ sectors: await sectorTree() } satisfies SectorsResponse);
        },
      ],
    },
  ];
}
