// @vitest-environment jsdom
import type { MeResponse } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequirePermission } from './require-permission';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: replaceMock }) }));

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
  role: 'general_coordinator',
  permissions: ['users.manage'],
  recintoScopes: [],
  landing: '/panel/general',
  usingDefaultPassword: false,
  permissionsStale: false,
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  replaceMock.mockReset();
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function renderGuarded(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

describe('RequirePermission', () => {
  it('renders its children once the user is confirmed to hold the permission', async () => {
    respond(200, me);
    renderGuarded(
      <RequirePermission permission="users.manage">
        <p>Administrar usuarios</p>
      </RequirePermission>,
    );
    expect(await screen.findByText('Administrar usuarios')).toBeDefined();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('redirects to /acceso-denegado once resolved without the permission', async () => {
    respond(200, me);
    renderGuarded(
      <RequirePermission permission="audit.view">
        <p>Auditoría</p>
      </RequirePermission>,
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/acceso-denegado'));
    expect(screen.queryByText('Auditoría')).toBeNull();
  });

  it('shows neither the content nor a redirect while the session is still loading', () => {
    respond(200, me);
    renderGuarded(
      <RequirePermission permission="users.manage">
        <p>Administrar usuarios</p>
      </RequirePermission>,
    );
    expect(screen.queryByText('Administrar usuarios')).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
