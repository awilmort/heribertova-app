import {
  apiErrorBodySchema,
  healthResponseSchema,
  meResponseSchema,
  totpRequiredResponseSchema,
  voterCardSchema,
  type ChangePasswordRequest,
  type ErrorCode,
  type FieldErrors,
  type LoginRequest,
  type TotpVerifyRequest,
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

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Calls the API (same origin, /api/*), sending the header its CSRF guard requires. */
function send(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...init?.headers },
  });
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/** Turns a non-2xx body into the thrown `ApiError`, from the shared `{error:{code,message,fields}}` shape. */
function throwApiError(status: number, body: unknown): never {
  const parsed = apiErrorBodySchema.safeParse(body);
  if (parsed.success) {
    const { code, message, fields } = parsed.data.error;
    throw new ApiError(status, code, message, fields);
  }
  throw new ApiError(status, 'INTERNAL_ERROR', messages.errors.generic);
}

interface RequestOptions<T> {
  schema: z.ZodType<T>;
  init?: RequestInit;
  /** Non-2xx statuses whose body is still a valid `schema` response (e.g. 503 from /health). */
  acceptStatuses?: readonly number[];
}

/**
 * Calls the API and validates the response with a shared zod schema, so a contract drift between
 * backend and frontend fails loudly instead of rendering bad data.
 */
export async function apiRequest<T>(
  path: string,
  { schema, init, acceptStatuses = [] }: RequestOptions<T>,
): Promise<T> {
  const res = await send(path, init);
  const body = await readJson(res);

  if (res.ok || acceptStatuses.includes(res.status)) {
    return schema.parse(body);
  }
  throwApiError(res.status, body);
}

/** Calls the API expecting a 204 with no body (logout, TOTP verification, password change). */
async function apiRequestVoid(path: string, init?: RequestInit): Promise<void> {
  const res = await send(path, init);
  if (res.ok) return;
  throwApiError(res.status, await readJson(res));
}

/**
 * `POST /api/auth/login`. Unlike every other call, its success shape depends on the status: 204
 * (no body) opens a session directly, while 202 means the superadmin must also pass `verifyTotp`.
 */
async function login(request: LoginRequest): Promise<{ totpRequired: boolean }> {
  const res = await send('/auth/login', jsonInit('POST', request));
  if (res.status === 204) return { totpRequired: false };

  const body = await readJson(res);
  if (res.status === 202) return totpRequiredResponseSchema.parse(body);
  throwApiError(res.status, body);
}

export const api = {
  health: () => apiRequest('/health', { schema: healthResponseSchema, acceptStatuses: [503] }),
  /** Padrón card of a cédula (11 digits); each call is audited and counts toward a daily quota. */
  lookupVoter: (cedula: string) => apiRequest(`/voters/${cedula}`, { schema: voterCardSchema }),
  login,
  verifyTotp: (request: TotpVerifyRequest) =>
    apiRequestVoid('/auth/totp/verify', jsonInit('POST', request)),
  logout: () => apiRequestVoid('/auth/logout', { method: 'POST' }),
  /** Who is logged in: person, role, permissions, landing page and whether the password is still the default. */
  me: () => apiRequest('/me', { schema: meResponseSchema }),
  changePassword: (request: ChangePasswordRequest) =>
    apiRequestVoid('/me/password', jsonInit('PUT', request)),
};
