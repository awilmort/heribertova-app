import type { GeneralDashboardResponse, LeaderDashboardResponse } from '@heribertova/shared';
import { createTtlCache } from '../../lib/ttlCache';
import type { ApiRoute } from '../../routing/apiRoute';
import { actorOf } from '../audit/service';
import { getGeneralDashboard, getLeaderDashboard, scopeCacheKey } from './service';

/** How long `/dashboards/general`'s aggregations are served stale before recomputing (plan 8.1). */
const GENERAL_DASHBOARD_CACHE_MS = 60_000;

export function createDashboardRoutes(): ApiRoute[] {
  const generalDashboardCache = createTtlCache<GeneralDashboardResponse>(
    GENERAL_DASHBOARD_CACHE_MS,
  );

  return [
    {
      method: 'get',
      path: '/dashboards/leader',
      access: 'authenticated',
      handlers: [
        async (req, res) => {
          const result = await getLeaderDashboard(actorOf(req));
          res.json(result satisfies LeaderDashboardResponse);
        },
      ],
    },
    {
      method: 'get',
      path: '/dashboards/general',
      access: 'dashboards.general',
      handlers: [
        async (req, res) => {
          const actor = actorOf(req);
          const result = await generalDashboardCache(scopeCacheKey(actor.user), () =>
            getGeneralDashboard(actor),
          );
          res.json(result satisfies GeneralDashboardResponse);
        },
      ],
    },
  ];
}
