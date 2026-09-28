import type { HealthResponse } from '@heribertova/shared';
import { Router } from 'express';
import { getHealth, type HealthChecks } from './service';

/** Liveness + dependency check. 503 when MongoDB or S3 is unreachable so uptime monitors alert. */
export function createHealthRouter(checks: HealthChecks): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    const health = await getHealth(checks);
    res.status(health.status === 'ok' ? 200 : 503).json(health satisfies HealthResponse);
  });
  return router;
}
