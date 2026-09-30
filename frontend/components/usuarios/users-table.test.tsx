// @vitest-environment jsdom
import type { MeResponse, SectorsResponse, UserListResponse } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { UsersTable } from './users-table';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const text = messages.admin.usuarios;

const me: MeResponse = {
  user: { id: 'admin', username: '00112345673' },
  person: {
    id: 'p0',
    fullName: 'ADMIN',
    nickname: null,
    recintoKey: 'liceo--centro-ciudad',
    recintoName: 'LICEO JUAN PABLO DUARTE',
    colegioId: 4675,
    sector: 'CENTRO CIUDAD',
  },
  role: 'superadmin',
  permissions: ['users.manage'],
  recintoScopes: [],
  landing: '/panel/general',
  usingDefaultPassword: false,
  permissionsStale: false,
};

function usersPage(items: UserListResponse['items']): UserListResponse {
  return { items, page: 1, pageSize: 20, total: items.length };
}

const activeCoordinator: UserListResponse['items'][number] = {
  id: 'u1',
  username: '00298765432',
  role: 'recinto_coordinator',
  recintoScopes: ['liceo--centro-ciudad'],
  isActive: true,
  usingDefaultPassword: true,
  locked: false,
  lastLoginAt: null,
  person: {
    fullName: 'PEDRO GÓMEZ',
    recintoName: 'LICEO JUAN PABLO DUARTE',
    sector: 'CENTRO CIUDAD',
  },
};

const lockedLeader: UserListResponse['items'][number] = {
  id: 'u2',
  username: '00376543210',
  role: 'team_leader',
  recintoScopes: [],
  isActive: true,
  usingDefaultPassword: false,
  locked: true,
  lastLoginAt: null,
  person: { fullName: 'ANA DÍAZ', recintoName: 'ESCUELA RURAL', sector: 'JUANILLO' },
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
          voterCount: 10,
          colegios: [],
        },
      ],
    },
  ],
};

const fetchMock = vi.fn<typeof fetch>();
let confirmMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  confirmMock = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmMock);
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

function routeFetch(handlers: [string, () => Response][]) {
  fetchMock.mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const method = init?.method ?? 'GET';
    for (const [pattern, handler] of handlers) {
      if (url.includes(pattern)) return Promise.resolve(handler());
    }
    throw new Error(`Unhandled request: ${method} ${url}`);
  });
}

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UsersTable />
    </QueryClientProvider>,
  );
}

describe('UsersTable', () => {
  it('lists users with their status badges', async () => {
    routeFetch([
      ['/api/users', () => jsonResponse(200, usersPage([activeCoordinator, lockedLeader]))],
    ]);
    renderTable();

    expect(await screen.findByText('PEDRO GÓMEZ')).toBeDefined();
    expect(screen.getByText('ANA DÍAZ')).toBeDefined();
    expect(screen.getByText(text.status.locked)).toBeDefined();
    expect(screen.getByText(text.status.usingDefaultPassword)).toBeDefined();
  });

  it('shows the empty state when there are no matches', async () => {
    routeFetch([['/api/users', () => jsonResponse(200, usersPage([]))]]);
    renderTable();
    expect(await screen.findByText(text.empty)).toBeDefined();
  });

  it('requeries with the role filter', async () => {
    routeFetch([['/api/users', () => jsonResponse(200, usersPage([]))]]);
    const user = userEvent.setup();
    renderTable();
    await screen.findByText(text.empty);

    await user.selectOptions(screen.getByLabelText(text.filters.roleLabel), 'team_leader');

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('role=team_leader'),
        expect.anything(),
      ),
    );
  });

  it('deactivates a user after confirming', async () => {
    routeFetch([
      ['/api/users/u1', () => jsonResponse(204, null)],
      ['/api/users', () => jsonResponse(200, usersPage([activeCoordinator]))],
    ]);
    const user = userEvent.setup();
    renderTable();
    await screen.findByText('PEDRO GÓMEZ');

    await user.click(screen.getAllByRole('button', { name: text.table.actions })[0]!);
    await user.click(await screen.findByRole('menuitem', { name: text.actions.deactivate }));

    expect(confirmMock).toHaveBeenCalledWith(text.confirm.deactivate('PEDRO GÓMEZ'));
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/users/u1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: false }) }),
      ),
    );
  });

  it('does nothing when the confirmation is declined', async () => {
    confirmMock.mockReturnValue(false);
    routeFetch([['/api/users', () => jsonResponse(200, usersPage([activeCoordinator]))]]);
    const user = userEvent.setup();
    renderTable();
    await screen.findByText('PEDRO GÓMEZ');

    await user.click(screen.getAllByRole('button', { name: text.table.actions })[0]!);
    await user.click(await screen.findByRole('menuitem', { name: text.actions.deactivate }));

    expect(fetchMock).not.toHaveBeenCalledWith('/api/users/u1', expect.anything());
  });

  it("resets a user's password after confirming", async () => {
    routeFetch([
      ['/api/users/u1/reset-password', () => jsonResponse(204, null)],
      ['/api/users', () => jsonResponse(200, usersPage([activeCoordinator]))],
    ]);
    const user = userEvent.setup();
    renderTable();
    await screen.findByText('PEDRO GÓMEZ');

    await user.click(screen.getAllByRole('button', { name: text.table.actions })[0]!);
    await user.click(await screen.findByRole('menuitem', { name: text.actions.resetPassword }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/users/u1/reset-password',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('offers "Desbloquear" only for a locked account', async () => {
    routeFetch([
      ['/api/users', () => jsonResponse(200, usersPage([activeCoordinator, lockedLeader]))],
    ]);
    const user = userEvent.setup();
    renderTable();
    await screen.findByText('PEDRO GÓMEZ');

    const [unlockedMenu, lockedMenu] = screen.getAllByRole('button', { name: text.table.actions });
    await user.click(unlockedMenu!);
    expect(screen.queryByRole('menuitem', { name: text.actions.unlock })).toBeNull();
    await user.keyboard('{Escape}');

    await user.click(lockedMenu!);
    expect(await screen.findByRole('menuitem', { name: text.actions.unlock })).toBeDefined();
  });

  it('offers "Editar recintos" only for a recinto coordinator, and opens the scopes dialog', async () => {
    routeFetch([
      ['/api/users', () => jsonResponse(200, usersPage([activeCoordinator, lockedLeader]))],
      ['/api/sectors', () => jsonResponse(200, sectors)],
    ]);
    const user = userEvent.setup();
    renderTable();
    await screen.findByText('PEDRO GÓMEZ');

    const [coordinatorMenu, leaderMenu] = screen.getAllByRole('button', {
      name: text.table.actions,
    });
    await user.click(leaderMenu!);
    expect(screen.queryByRole('menuitem', { name: text.actions.editScopes })).toBeNull();
    await user.keyboard('{Escape}');

    await user.click(coordinatorMenu!);
    await user.click(await screen.findByRole('menuitem', { name: text.actions.editScopes }));

    expect(
      await screen.findByText(messages.admin.usuarios.scopesDialog.title('PEDRO GÓMEZ')),
    ).toBeDefined();
  });

  it('opens the appoint dialog, backed by the current role for /me', async () => {
    routeFetch([
      ['/api/users', () => jsonResponse(200, usersPage([]))],
      ['/api/me', () => jsonResponse(200, me)],
    ]);
    const user = userEvent.setup();
    renderTable();
    await screen.findByText(text.empty);

    await user.click(screen.getByRole('button', { name: text.appoint }));

    expect(
      await screen.findByRole('heading', { name: messages.admin.usuarios.appointDialog.title }),
    ).toBeDefined();
  });
});
