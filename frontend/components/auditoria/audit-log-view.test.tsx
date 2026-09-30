// @vitest-environment jsdom
import type { AuditLogResponse } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { AuditLogView } from './audit-log-view';

const text = messages.admin.auditoria;

function page(overrides: Partial<AuditLogResponse> = {}): AuditLogResponse {
  return {
    items: [
      {
        id: 'a1',
        action: 'user.unlocked',
        entity: 'user',
        entityId: 'u1',
        summary: 'Desbloqueó la cuenta de 002-*******-2.',
        actorUsername: '00112345673',
        ip: '203.0.113.7',
        at: '2026-01-05T12:00:00.000Z',
      },
    ],
    page: 1,
    pageSize: 20,
    total: 1,
    ...overrides,
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

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuditLogView />
    </QueryClientProvider>,
  );
}

describe('AuditLogView', () => {
  it('lists entries with the actor and a Spanish action label', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, page()));
    renderView();

    expect(await screen.findByText('Desbloqueó la cuenta de 002-*******-2.')).toBeDefined();
    expect(screen.getByText('00112345673')).toBeDefined();
    expect(screen.getByRole('cell', { name: text.actions['user.unlocked'] })).toBeDefined();
  });

  it('shows the empty state when there is nothing logged', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, page({ items: [], total: 0 })));
    renderView();
    expect(await screen.findByText(text.empty)).toBeDefined();
  });

  it('requeries with the action filter, resetting to page 1', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, page()));
    const user = userEvent.setup();
    renderView();
    await screen.findByText('00112345673');

    await user.selectOptions(screen.getByLabelText(text.filters.actionLabel), 'user.unlocked');

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('action=user.unlocked'),
        expect.anything(),
      ),
    );
    expect(fetchMock.mock.calls.at(-1)?.[0]).not.toEqual(expect.stringContaining('page=2'));
  });

  it('paginates with previous/next', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, page({ page: 1, pageSize: 1, total: 2 })));
    const user = userEvent.setup();
    renderView();
    await screen.findByText('00112345673');

    expect(screen.getByRole('button', { name: text.pagination.previous })).toHaveProperty(
      'disabled',
      true,
    );
    await user.click(screen.getByRole('button', { name: text.pagination.next }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.anything()),
    );
  });
});
