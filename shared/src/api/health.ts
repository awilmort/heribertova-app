import { z } from 'zod';

const dependencyStatusSchema = z.enum(['up', 'down']);

/** `GET /api/health`: `ok` only when every dependency is up (503 + `degraded` otherwise). */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  mongo: dependencyStatusSchema,
  s3: dependencyStatusSchema,
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
