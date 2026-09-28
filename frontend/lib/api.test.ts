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
