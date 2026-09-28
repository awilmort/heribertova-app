import type { HealthResponse } from '@heribertova/shared';
import type { ApiRoute } from '../../routing/apiRoute';
import { getHealth, type HealthChecks } from './service';

/** Liveness + dependency check. 503 when MongoDB or S3 is unreachable so uptime monitors alert. */
export function createHealthRoutes(checks: HealthChecks): ApiRoute[] {
  return [
    {
      method: 'get',
      path: '/health',
      access: 'public',
      handlers: [
        async (_req, res) => {
          const health = await getHealth(checks);
          res.status(health.status === 'ok' ? 200 : 503).json(health satisfies HealthResponse);
        },
      ],
    },
  ];
}
