// @vitest-environment jsdom
import type { MeResponse } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InicioRedirect } from './inicio-redirect';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

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
  permissions: [],
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
  replace.mockReset();
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function renderRedirect() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <InicioRedirect />
    </QueryClientProvider>,
  );
}

describe('InicioRedirect', () => {
  it("replaces the URL with the role's landing page once /me resolves", async () => {
    respond(200, me);
    renderRedirect();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/panel'));
  });

  it('follows a different landing page for a different role', async () => {
    respond(200, { ...me, role: 'superadmin', landing: '/panel/general' });
    renderRedirect();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/panel/general'));
  });

  it('does not redirect while /me is still loading', () => {
    respond(200, me);
    renderRedirect();
    expect(replace).not.toHaveBeenCalled();
  });
});
