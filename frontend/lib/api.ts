import {
  apiErrorBodySchema,
  healthResponseSchema,
  type ErrorCode,
  type FieldErrors,
} from '@heribertova/shared';
import type { z } from 'zod';
import { messages } from '@/messages/es';

/** A failed API call: HTTP status plus the API's error code and user-facing message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions<T> {
  schema: z.ZodType<T>;
  init?: RequestInit;
  /** Non-2xx statuses whose body is still a valid `schema` response (e.g. 503 from /health). */
  acceptStatuses?: readonly number[];
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Calls the API (same origin, /api/*) and validates the response with a shared zod schema, so a
 * contract drift between backend and frontend fails loudly instead of rendering bad data.
 */
export async function apiRequest<T>(
  path: string,
  { schema, init, acceptStatuses = [] }: RequestOptions<T>,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init?.headers },
  });
  const body = await readJson(res);

  if (res.ok || acceptStatuses.includes(res.status)) {
    return schema.parse(body);
  }

  const parsed = apiErrorBodySchema.safeParse(body);
  if (parsed.success) {
    const { code, message, fields } = parsed.data.error;
    throw new ApiError(res.status, code, message, fields);
  }
  throw new ApiError(res.status, 'INTERNAL_ERROR', messages.errors.generic);
}

export const api = {
  health: () => apiRequest('/health', { schema: healthResponseSchema, acceptStatuses: [503] }),
};
