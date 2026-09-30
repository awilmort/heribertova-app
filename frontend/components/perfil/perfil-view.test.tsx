// @vitest-environment jsdom
import type { MeResponse } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { PerfilView } from './perfil-view';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

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
  permissions: ['voters.lookup'],
  recintoScopes: [],
  landing: '/panel',
  usingDefaultPassword: true,
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

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PerfilView />
    </QueryClientProvider>,
  );
}

describe('PerfilView', () => {
  it('shows the person data and role in Spanish', async () => {
    respond(200, me);
    renderView();

    expect(await screen.findByText(me.person.fullName)).toBeDefined();
    expect(screen.getByText('001-1234567-3')).toBeDefined();
    expect(screen.getByText(me.person.recintoName)).toBeDefined();
    expect(screen.getByText(me.person.sector)).toBeDefined();
    expect(screen.getByText(messages.roles.team_leader)).toBeDefined();
  });

  it('renders the change-password form once the data loads', async () => {
    respond(200, me);
    renderView();
    expect(
      await screen.findByLabelText(messages.perfil.changePassword.currentPasswordLabel),
    ).toBeDefined();
  });

  it('shows a generic error when /me fails', async () => {
    respond(500, { error: { code: 'INTERNAL_ERROR', message: 'Error interno.' } });
    renderView();
    expect(await screen.findByRole('alert')).toBeDefined();
  });
});
