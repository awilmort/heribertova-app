// @vitest-environment jsdom
import type { MeResponse } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { AuthenticatedShell } from './authenticated-shell';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/inicio' }));

const me: MeResponse = {
  user: { id: 'u1', username: '00112345673' },
  person: {
    id: 'p1',
    fullName: 'MARÍA ALTAGRACIA RODRÍGUEZ',
    nickname: 'Mary',
    recintoKey: 'liceo--centro-ciudad',
    recintoName: 'LICEO JUAN PABLO DUARTE',
    colegioId: 4675,
    sector: 'CENTRO CIUDAD',
  },
  role: 'team_leader',
  permissions: [],
  landing: '/panel',
  usingDefaultPassword: false,
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthenticatedShell>
        <p>Page content</p>
      </AuthenticatedShell>
    </QueryClientProvider>,
  );
}

describe('AuthenticatedShell', () => {
  it('renders the shell with the logged-in user once /me resolves', async () => {
    respond(200, me);
    renderShell();

    expect(await screen.findByText('Page content')).toBeDefined();
    expect(screen.getByText('Mary')).toBeDefined();
  });

  it('shows the default-password banner when usingDefaultPassword is true', async () => {
    respond(200, { ...me, usingDefaultPassword: true });
    renderShell();

    expect(await screen.findByText(messages.auth.passwordChange.banner)).toBeDefined();
  });

  it('shows no banner once the password has been changed', async () => {
    respond(200, me);
    renderShell();

    await screen.findByText('Page content');
    expect(screen.queryByText(messages.auth.passwordChange.banner)).toBeNull();
  });

  it('redirects to /login when the session has expired (401 from /me)', async () => {
    respond(401, { error: { code: 'UNAUTHENTICATED', message: 'Su sesión expiró.' } });
    renderShell();

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Page content')).toBeNull();
  });

  it('offers a retry on an unexpected error other than 401', async () => {
    respond(500, { error: { code: 'INTERNAL_ERROR', message: 'Error interno.' } });
    renderShell();

    expect(await screen.findByRole('button', { name: messages.errors.retry })).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });
});
