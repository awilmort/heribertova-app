// @vitest-environment jsdom
import type { MeResponse } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Can } from './can';

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
  role: 'aspiring_leader',
  permissions: ['voters.lookup'],
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

function renderWithClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

describe('Can', () => {
  it('renders its children when the user holds the permission', async () => {
    respond(200, me);
    renderWithClient(
      <Can permission="voters.lookup">
        <p>Consultar padrón</p>
      </Can>,
    );
    expect(await screen.findByText('Consultar padrón')).toBeDefined();
  });

  it('renders nothing when the user lacks the permission', async () => {
    respond(200, me);
    renderWithClient(
      <Can permission="users.manage">
        <p>Administrar usuarios</p>
      </Can>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText('Administrar usuarios')).toBeNull();
  });

  it('renders nothing while the session is still loading', () => {
    respond(200, me);
    renderWithClient(
      <Can permission="voters.lookup">
        <p>Consultar padrón</p>
      </Can>,
    );
    expect(screen.queryByText('Consultar padrón')).toBeNull();
  });
});
