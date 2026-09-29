// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { UserMenu } from './user-menu';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.unstubAllGlobals();
});

function renderMenu() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <UserMenu name="Mary" />
    </QueryClientProvider>,
  );
  return client;
}

describe('UserMenu', () => {
  it('offers the profile link and a logout action', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: messages.shell.userMenu }));

    expect(await screen.findByRole('menuitem', { name: messages.shell.profile })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: messages.shell.logout })).toBeDefined();
  });

  it('logs out, clears cached queries and redirects to /login', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const user = userEvent.setup();
    const client = renderMenu();
    const clear = vi.spyOn(client, 'clear');

    await user.click(screen.getByRole('button', { name: messages.shell.userMenu }));
    await user.click(await screen.findByRole('menuitem', { name: messages.shell.logout }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(clear).toHaveBeenCalled();
  });
});
