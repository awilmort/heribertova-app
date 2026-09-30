import {
  apiErrorBodySchema,
  appointUserResponseSchema,
  auditLogResponseSchema,
  backupManifestSchema,
  backupStatusResponseSchema,
  checkPersonResponseSchema,
  generalDashboardResponseSchema,
  createImportResponseSchema,
  healthResponseSchema,
  importUploadUrlResponseSchema,
  leaderDashboardResponseSchema,
  leadersResponseSchema,
  listPeopleResponseSchema,
  meResponseSchema,
  nominationResponseSchema,
  personDetailSchema,
  promotionSettingsSchema,
  recintoListResponseSchema,
  recintoSummarySchema,
  recintoVotersResponseSchema,
  sectorsResponseSchema,
  totpRequiredResponseSchema,
  userListResponseSchema,
  voterCardSchema,
  voterImportListResponseSchema,
  voterImportSchema,
  type AppointUserRequest,
  type AssignRecintoCoordinatorsRequest,
  type AuditLogQuery,
  type ChangePasswordRequest,
  type CreateImportRequest,
  type CreatePersonRequest,
  type ErrorCode,
  type ExportPeopleQuery,
  type FieldErrors,
  type ImportUploadUrlRequest,
  type LeadersQuery,
  type ListPeopleQuery,
  type LoginRequest,
  type NominationRequest,
  type PhotoKind,
  type RecintoListQuery,
  type RecintoVotersQuery,
  type TotpVerifyRequest,
  type UpdatePersonRequest,
  type UpdateUserRequest,
  type UserListQuery,
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

/** A single `photo` field, multipart (never JSON): the backend re-encodes it server-side regardless
 * of what the browser sends, so no `Content-Type` is set here — fetch adds the multipart boundary. */
function photoFormInit(file: Blob): RequestInit {
  const body = new FormData();
  body.append('photo', file, 'photo.jpg');
  return { method: 'POST', body };
}

/** "?a=1&b=2", dropping undefined values; "" when nothing is left. */
export function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
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
  /** Sector → recinto → colegio tree, for filters and the recinto picker (plan 4.3, 7.x). */
  sectors: () => apiRequest('/sectors', { schema: sectorsResponseSchema }),
  login,
  verifyTotp: (request: TotpVerifyRequest) =>
    apiRequestVoid('/auth/totp/verify', jsonInit('POST', request)),
  logout: () => apiRequestVoid('/auth/logout', { method: 'POST' }),
  /** Who is logged in: person, role, permissions, landing page and whether the password is still the default. */
  me: () => apiRequest('/me', { schema: meResponseSchema }),
  changePassword: (request: ChangePasswordRequest) =>
    apiRequestVoid('/me/password', jsonInit('PUT', request)),
  /** `/admin/usuarios` (plan 4.3): the user list, filterable by role, active state and default password. */
  listUsers: (query: Partial<UserListQuery> = {}) =>
    apiRequest(`/users${queryString(query)}`, { schema: userListResponseSchema }),
  appointUser: (request: AppointUserRequest) =>
    apiRequest('/users', { schema: appointUserResponseSchema, init: jsonInit('POST', request) }),
  updateUser: (id: string, patch: UpdateUserRequest) =>
    apiRequestVoid(`/users/${id}`, jsonInit('PATCH', patch)),
  resetUserPassword: (id: string) =>
    apiRequestVoid(`/users/${id}/reset-password`, { method: 'POST' }),
  unlockUser: (id: string) => apiRequestVoid(`/users/${id}/unlock`, { method: 'POST' }),
  /** `/admin/auditoria` (plan 4.3): the audit trail, filterable by action, entity and day range. */
  listAudit: (query: Partial<AuditLogQuery> = {}) =>
    apiRequest(`/audit${queryString(query)}`, { schema: auditLogResponseSchema }),
  /** `/equipo` (plan 5.3): whether `cedula` can become a member, and the padrón fields to prefill. */
  checkPerson: (cedula: string) =>
    apiRequest('/people/check', {
      schema: checkPersonResponseSchema,
      init: jsonInit('POST', { cedula }),
    }),
  /**
   * `POST /api/people`: `idempotencyKey` should stay the same across retries of the same submit (a
   * flaky connection resending it) so the server returns the one record it already created instead
   * of a duplicate-cédula error.
   */
  registerPerson: (request: CreatePersonRequest, idempotencyKey: string) =>
    apiRequest('/people', {
      schema: personDetailSchema,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(request),
      },
    }),
  listPeople: (query: Partial<ListPeopleQuery> = {}) =>
    apiRequest(`/people${queryString(query)}`, { schema: listPeopleResponseSchema }),
  getPerson: (id: string) => apiRequest(`/people/${id}`, { schema: personDetailSchema }),
  updatePerson: (id: string, patch: UpdatePersonRequest) =>
    apiRequest(`/people/${id}`, { schema: personDetailSchema, init: jsonInit('PATCH', patch) }),
  deletePerson: (id: string, reason: string) =>
    apiRequestVoid(`/people/${id}`, jsonInit('DELETE', { reason })),
  /** `POST /api/people/:id/photos/:kind` (plan 5.2): `file` has already been compressed on-device. */
  uploadPersonPhoto: (id: string, kind: PhotoKind, file: Blob) =>
    apiRequest(`/people/${id}/photos/${kind}`, {
      schema: personDetailSchema,
      init: photoFormInit(file),
    }),
  /** `/panel` (plan 6.2): the caller's own progress, open aspirants, and birthdays. */
  leaderDashboard: () =>
    apiRequest('/dashboards/leader', { schema: leaderDashboardResponseSchema }),
  /** `/panel/general` (plan 8.1): campaign-wide totals and charts, narrowed to a recinto
   * coordinator's own recintos server-side; cached 60 s on the API. */
  generalDashboard: () =>
    apiRequest('/dashboards/general', { schema: generalDashboardResponseSchema }),
  /** `/lideres` (plan 6.3): leaders and aspirants in scope, each with their direct team. */
  listLeaders: (query: Partial<LeadersQuery> = {}) =>
    apiRequest(`/leaders${queryString(query)}`, { schema: leadersResponseSchema }),
  /** The promotion thresholds (plan 6.1): readable by anyone, so the nomination dialog can show
   * "Registre N más para habilitar" with the real configured minimum. */
  promotionSettings: () => apiRequest('/settings/promotion', { schema: promotionSettingsSchema }),
  /** `POST /api/promotions/nominations` (plan 6.1): the "Nominar aspirante" dialog. */
  nominate: (request: NominationRequest) =>
    apiRequest('/promotions/nominations', {
      schema: nominationResponseSchema,
      init: jsonInit('POST', request),
    }),
  /** `/mi-recinto` (plan 7.1): stats cards for one recinto, scope-checked server-side. */
  recintoSummary: (key: string) =>
    apiRequest(`/recintos/${key}/summary`, { schema: recintoSummarySchema }),
  /** `/mi-recinto` (plan 7.1): the recinto's active voters, with membership badges. */
  listRecintoVoters: (key: string, query: Partial<RecintoVotersQuery> = {}) =>
    apiRequest(`/recintos/${key}/voters${queryString(query)}`, {
      schema: recintoVotersResponseSchema,
    }),
  /** `/recintos` (plan 7.2): every recinto's coverage — members, leaders, aspirants, coordinators. */
  listRecintos: (query: Partial<RecintoListQuery> = {}) =>
    apiRequest(`/recintos${queryString(query)}`, { schema: recintoListResponseSchema }),
  /** `PUT /api/recintos/:key/coordinators` (plan 7.2): replaces who covers this recinto. */
  assignRecintoCoordinators: (key: string, request: AssignRecintoCoordinatorsRequest) =>
    apiRequestVoid(`/recintos/${key}/coordinators`, jsonInit('PUT', request)),
  /** `/admin/padron` (plan 9.1): re-enters the superadmin's TOTP code before a sensitive action. */
  reverifyTotp: (request: TotpVerifyRequest) =>
    apiRequestVoid('/auth/totp/reverify', jsonInit('POST', request)),
  /** `/admin/padron` (plan 9.1): where to PUT the voter file, once its SHA-256 (computed in the
   * browser) is confirmed to be new. */
  requestImportUploadUrl: (request: ImportUploadUrlRequest) =>
    apiRequest('/imports/upload-url', {
      schema: importUploadUrlResponseSchema,
      init: jsonInit('POST', request),
    }),
  /** `/admin/padron` (plan 9.1): the file already sits at `s3Key`; starts validating it. */
  createImport: (request: CreateImportRequest) =>
    apiRequest('/imports', { schema: createImportResponseSchema, init: jsonInit('POST', request) }),
  /** `/admin/padron` (plan 9.1): polled while the import validates, for its progress and report. */
  getImport: (id: string) => apiRequest(`/imports/${id}`, { schema: voterImportSchema }),
  /** `/admin/padron` (plan 9.2): the import history, newest first. */
  listImports: () => apiRequest('/imports', { schema: voterImportListResponseSchema }),
  /** `POST /api/imports/:id/apply` (plan 9.2): applies a staged import. */
  applyImport: (id: string) =>
    apiRequest(`/imports/${id}/apply`, { schema: voterImportSchema, init: { method: 'POST' } }),
  /** `DELETE /api/imports/:id` (plan 9.2): discards a staged or failed import. */
  discardImport: (id: string) => apiRequestVoid(`/imports/${id}`, { method: 'DELETE' }),
  /** `/admin/respaldos` (plan 9.3): the last backup's manifest and the Atlas M0 storage budget. */
  backupStatus: () => apiRequest('/backups/status', { schema: backupStatusResponseSchema }),
  /** `POST /api/backups` (plan 9.3): makes a backup now, replacing the previous one. */
  createBackup: () =>
    apiRequest('/backups', { schema: backupManifestSchema, init: { method: 'POST' } }),
};

/** `GET /api/people/:id/photos/:kind` (plan 5.2) redirects to a presigned URL: an `<img>` follows it
 * like any other same-origin request, cookie included, so this is a plain URL, not an `apiRequest`. */
export function personPhotoUrl(id: string, kind: PhotoKind): string {
  return `/api/people/${id}/photos/${kind}`;
}

/** `GET /api/exports/people.xlsx` (plan 6.4): a plain URL, like the photo one above — GET needs no
 * CSRF header, so a browser download (an `<a href>` navigation) sends the session cookie on its
 * own and streams the file straight to disk. */
export function exportPeopleXlsxUrl(query: Partial<ExportPeopleQuery> = {}): string {
  return `/api/exports/people.xlsx${queryString(query)}`;
}

/** `GET /api/exports/recintos.xlsx` (plan 6.4): every recinto, no filters — `/recintos` (plan 7.2)
 * is its only consuming page, and its own filters (sector, search) are for the table, not the
 * export. */
export const exportRecintosXlsxUrl = '/api/exports/recintos.xlsx';

/** `GET /api/exports/leaders.xlsx` (plan 8.2): each leader's progress toward their goal, a shape
 * `exportPeopleXlsxUrl` can't give — `/reportes`'s "leaders' progress" report. */
export function exportLeadersXlsxUrl(query: Partial<LeadersQuery> = {}): string {
  return `/api/exports/leaders.xlsx${queryString(query)}`;
}
