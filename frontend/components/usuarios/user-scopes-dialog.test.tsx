// @vitest-environment jsdom
import type { SectorsResponse, UserSummary } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { UserScopesDialog } from './user-scopes-dialog';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const text = messages.admin.usuarios.scopesDialog;

const user: UserSummary = {
  id: 'u1',
  username: '00298765432',
  role: 'recinto_coordinator',
  recintoScopes: ['liceo--centro-ciudad'],
  isActive: true,
  usingDefaultPassword: false,
  locked: false,
  lastLoginAt: null,
  person: {
    fullName: 'PEDRO GÓMEZ',
    recintoName: 'LICEO JUAN PABLO DUARTE',
    sector: 'CENTRO CIUDAD',
  },
};

const sectors: SectorsResponse = {
  sectors: [
    {
      name: 'CENTRO CIUDAD',
      voterCount: 10,
      recintos: [
        {
          key: 'liceo--centro-ciudad',
          name: 'LICEO JUAN PABLO DUARTE',
          voterCount: 5,
          colegios: [],
        },
        { key: 'escuela--centro-ciudad', name: 'ESCUELA PRIMARIA', voterCount: 5, colegios: [] },
      ],
    },
  ],
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return body === null
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
}

function routeFetch(handlers: Record<string, () => Response>) {
  fetchMock.mockImplementation((input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) return Promise.resolve(handler());
    }
    throw new Error(`Unhandled request: ${url}`);
  });
}

function renderDialog(onOpenChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UserScopesDialog user={user} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return onOpenChange;
}

describe('UserScopesDialog', () => {
  it("shows the title with the person's name and the recinto picker", async () => {
    routeFetch({ '/api/sectors': () => jsonResponse(200, sectors) });
    renderDialog();
    expect(await screen.findByText(text.title('PEDRO GÓMEZ'))).toBeDefined();
    expect(await screen.findByText('LICEO JUAN PABLO DUARTE')).toBeDefined();
  });

  it('saves the updated recintoScopes and closes on success', async () => {
    routeFetch({
      '/api/sectors': () => jsonResponse(200, sectors),
      '/api/users/u1': () => jsonResponse(204, null),
    });
    const onOpenChange = renderDialog();
    const user2 = userEvent.setup();
    await screen.findByText('LICEO JUAN PABLO DUARTE');

    await user2.click(screen.getByRole('button', { name: text.submit }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeDefined();
  });
});
