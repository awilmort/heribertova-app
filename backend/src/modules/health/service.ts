import type { HealthResponse } from '@heribertova/shared';

/** One probe per dependency; each resolves to whether the dependency answers (never throws). */
export interface HealthChecks {
  mongo: () => Promise<boolean>;
  s3: () => Promise<boolean>;
}

export async function getHealth(checks: HealthChecks): Promise<HealthResponse> {
  const [mongoUp, s3Up] = await Promise.all([checks.mongo(), checks.s3()]);
  return {
    status: mongoUp && s3Up ? 'ok' : 'degraded',
    mongo: mongoUp ? 'up' : 'down',
    s3: s3Up ? 'up' : 'down',
  };
}
