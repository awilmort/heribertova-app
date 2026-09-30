// @vitest-environment jsdom
import type { SectorsResponse, UserSummary } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { ChangeRoleDialog } from './change-role-dialog';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const text = messages.admin.usuarios.changeRoleDialog;

const teamLeader: UserSummary = {
  id: 'u1',
  username: '00298765432',
  role: 'team_leader',
  recintoScopes: [],
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

function renderDialog(user: UserSummary, onOpenChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ChangeRoleDialog user={user} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return onOpenChange;
}

describe('ChangeRoleDialog', () => {
  it('defaults to general coordinator for a team leader, and submits it with no recintoScopes', async () => {
    routeFetch({ '/api/users/u1': () => jsonResponse(204, null) });
    const onOpenChange = renderDialog(teamLeader);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: text.submit }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/u1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ role: 'general_coordinator' }),
      }),
    );
  });

  it('requires a recinto before submitting as a recinto coordinator', async () => {
    routeFetch({ '/api/sectors': () => jsonResponse(200, sectors) });
    renderDialog(teamLeader);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByRole('combobox'), 'recinto_coordinator');
    await screen.findByText('LICEO JUAN PABLO DUARTE');

    expect(screen.getByRole('button', { name: text.submit })).toHaveProperty('disabled', true);

    await user.click(screen.getByRole('checkbox', { name: 'LICEO JUAN PABLO DUARTE' }));

    expect(screen.getByRole('button', { name: text.submit })).toHaveProperty('disabled', false);
  });
});
