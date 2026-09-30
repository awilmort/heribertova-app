// @vitest-environment jsdom
import type { MeResponse } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePermission, usePermissions } from './permissions';

const me: MeResponse = {
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
  permissions: ['voters.lookup', 'people.create'],
  recintoScopes: [],
  landing: '/panel',
  usingDefaultPassword: false,
  permissionsStale: false,
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePermissions', () => {
  it('returns an empty list while /me is loading', () => {
    respond(200, me);
    const { result } = renderHook(() => usePermissions(), { wrapper });
    expect(result.current).toEqual([]);
  });

  it('returns the permissions from /me once it resolves', async () => {
    respond(200, me);
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current).toEqual(['voters.lookup', 'people.create']));
  });

  it('returns an empty list when /me fails', async () => {
    respond(500, { error: { code: 'INTERNAL_ERROR', message: 'Error interno.' } });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});

describe('usePermission', () => {
  it('is true for a permission the role holds', async () => {
    respond(200, me);
    const { result } = renderHook(() => usePermission('voters.lookup'), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is false for a permission the role does not hold', async () => {
    respond(200, me);
    const { result } = renderHook(() => usePermission('users.manage'), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
