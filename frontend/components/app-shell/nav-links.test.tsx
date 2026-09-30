// @vitest-environment jsdom
import type { MeResponse } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { NavLinks } from './nav-links';

vi.mock('next/navigation', () => ({ usePathname: () => '/inicio' }));

function meWithPermissions(permissions: MeResponse['permissions']): MeResponse {
  return {
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
    permissions,
    recintoScopes: [],
    landing: '/panel',
    usingDefaultPassword: false,
    permissionsStale: false,
  };
}

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

function renderNav() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NavLinks />
    </QueryClientProvider>,
  );
}

describe('NavLinks', () => {
  it('shows an item with no permission requirement to every role', async () => {
    respond(200, meWithPermissions([]));
    renderNav();
    expect(await screen.findByText(messages.nav.home)).toBeDefined();
  });

  it('hides an item whose permission the user lacks', async () => {
    respond(200, meWithPermissions([]));
    renderNav();
    await screen.findByText(messages.nav.home);
    expect(screen.queryByText(messages.nav.padron)).toBeNull();
  });

  it('shows an item once the user holds its permission', async () => {
    respond(200, meWithPermissions(['voters.lookup']));
    renderNav();
    expect(await screen.findByText(messages.nav.padron)).toBeDefined();
  });

  it('shows no permission-gated items before /me resolves', () => {
    respond(200, meWithPermissions(['voters.lookup']));
    renderNav();
    expect(screen.queryByText(messages.nav.padron)).toBeNull();
  });
});
