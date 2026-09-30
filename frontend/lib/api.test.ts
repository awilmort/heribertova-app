import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { messages } from '@/messages/es';

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function apiError(code: string, message: string) {
  return { error: { code, message } };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api.health', () => {
  it('calls the same-origin /api path and returns the parsed body', async () => {
    const fetchMock = mockFetch(200, { status: 'ok', mongo: 'up', s3: 'up' });
    await expect(api.health()).resolves.toEqual({ status: 'ok', mongo: 'up', s3: 'up' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('sends X-Requested-With, which the API requires on state-changing requests', async () => {
    const fetchMock = mockFetch(200, { status: 'ok', mongo: 'up', s3: 'up' });
    await api.health();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Requested-With': 'XMLHttpRequest' }) as unknown,
      }),
    );
  });

  it('accepts the 503 degraded response as data', async () => {
    mockFetch(503, { status: 'degraded', mongo: 'up', s3: 'down' });
    await expect(api.health()).resolves.toEqual({ status: 'degraded', mongo: 'up', s3: 'down' });
  });

  it('throws ApiError with the API code and message on an error response', async () => {
    mockFetch(429, { error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes.' } });
    const error = await api.health().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Demasiadas solicitudes.',
    });
  });

  it('throws a generic ApiError when the error body is not JSON (e.g. API unreachable)', async () => {
    mockFetch(500, 'Internal Server Error');
    const error = await api.health().catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: messages.errors.generic,
    });
  });

  it('fails loudly when a success body does not match the contract', async () => {
    mockFetch(200, { status: 'maybe' });
    await expect(api.health()).rejects.toThrow();
  });
});

function mockEmptyResponse(status: number) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('api.login', () => {
  const request = { cedula: '00112345673', password: 'secret', turnstileToken: 'tok' };

  it('reports no TOTP step on a 204 (the session cookie is already set)', async () => {
    mockEmptyResponse(204);
    await expect(api.login(request)).resolves.toEqual({ totpRequired: false });
  });

  it('sends the JSON body with the content type the API expects', async () => {
    const fetchMock = mockEmptyResponse(204);
    await api.login(request);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }) as unknown,
      }),
    );
  });

  it('reports the TOTP step on a 202 (superadmin)', async () => {
    mockFetch(202, { totpRequired: true });
    await expect(api.login(request)).resolves.toEqual({ totpRequired: true });
  });

  it('throws the generic invalid-credentials error on a 401', async () => {
    mockFetch(
      401,
      apiError(
        'INVALID_CREDENTIALS',
        'No pudimos iniciar su sesión. Verifique su cédula y contraseña e intente nuevamente.',
      ),
    );
    const error = await api.login(request).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });
});

describe('api.verifyTotp', () => {
  it('resolves on a 204', async () => {
    mockEmptyResponse(204);
    await expect(api.verifyTotp({ code: '123456' })).resolves.toBeUndefined();
  });

  it('throws ApiError on a wrong code', async () => {
    mockFetch(
      401,
      apiError(
        'INVALID_TOTP_CODE',
        'El código no es válido. Escriba el código que muestra ahora su aplicación.',
      ),
    );
    const error = await api.verifyTotp({ code: '000000' }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 401, code: 'INVALID_TOTP_CODE' });
  });
});

describe('api.logout', () => {
  it('resolves on a 204, even without a prior session', async () => {
    const fetchMock = mockEmptyResponse(204);
    await expect(api.logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('api.me', () => {
  const me = {
    user: { id: 'u1', username: '00112345673' },
    person: {
      id: 'p1',
      fullName: 'MARÍA ALTAGRACIA RODRÍGUEZ',
      nickname: null,
      recintoKey: 'liceo--centro-ciudad',
      recintoName: 'LICEO JUAN PABLO DUARTE',
      colegioId: 4675,
      sector: 'CENTRO CIUDAD',
    },
    role: 'team_leader',
    permissions: ['voters.lookup'],
    recintoScopes: [],
    landing: '/panel',
    usingDefaultPassword: true,
    permissionsStale: false,
  };

  it('returns who is logged in', async () => {
    mockFetch(200, me);
    await expect(api.me()).resolves.toEqual(me);
  });
});

describe('api.changePassword', () => {
  it('resolves on a 204', async () => {
    mockEmptyResponse(204);
    await expect(
      api.changePassword({ currentPassword: 'old-secret', newPassword: 'new-secret-1' }),
    ).resolves.toBeUndefined();
  });

  it('throws ApiError with the field the server rejected', async () => {
    mockFetch(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son válidos.',
        fields: { 'body.currentPassword': ['La contraseña actual no es correcta.'] },
      },
    });
    const error = await api
      .changePassword({ currentPassword: 'wrong', newPassword: 'new-secret-1' })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: { 'body.currentPassword': ['La contraseña actual no es correcta.'] },
    });
  });
});
