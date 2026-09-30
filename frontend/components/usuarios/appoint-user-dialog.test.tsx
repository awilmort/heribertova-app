// @vitest-environment jsdom
import type { MeResponse, SectorsResponse, VoterCard } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { AppointUserDialog } from './appoint-user-dialog';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const text = messages.admin.usuarios.appointDialog;

function meWithRole(role: MeResponse['role']): MeResponse {
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
    role,
    permissions: ['users.manage'],
    recintoScopes: [],
    landing: '/panel/general',
    usingDefaultPassword: false,
    permissionsStale: false,
  };
}

const voterCard: VoterCard = {
  cedula: '00298765432',
  fullName: 'PEDRO GÓMEZ',
  age: 40,
  birthDay: 5,
  birthMonth: 6,
  sector: 'CENTRO CIUDAD',
  recintoKey: 'liceo--centro-ciudad',
  recintoName: 'LICEO JUAN PABLO DUARTE',
  colegioId: 4675,
  membership: { status: 'none' },
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

/** Routes each request by URL, since this dialog calls /me, /voters/:cedula, /sectors and /users. */
function routeFetch(handlers: Record<string, () => Response>) {
  fetchMock.mockImplementation((input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) return Promise.resolve(handler());
    }
    throw new Error(`Unhandled request: ${url}`);
  });
}

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AppointUserDialog />
    </QueryClientProvider>,
  );
}

describe('AppointUserDialog', () => {
  it('opens on the trigger button and searches a cédula', async () => {
    routeFetch({
      '/api/me': () => jsonResponse(200, meWithRole('superadmin')),
      '/api/voters/': () => jsonResponse(200, voterCard),
      '/api/sectors': () => jsonResponse(200, sectors),
    });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: messages.admin.usuarios.appoint }));
    await user.type(screen.getByLabelText(text.cedulaLabel), '0029876543-2');
    await user.click(screen.getByRole('button', { name: text.search }));

    expect(await screen.findByText('PEDRO GÓMEZ')).toBeDefined();
  });

  it('shows the not-found message for a cédula outside the padrón', async () => {
    routeFetch({
      '/api/me': () => jsonResponse(200, meWithRole('superadmin')),
      '/api/voters/': () =>
        jsonResponse(404, {
          error: { code: 'NOT_FOUND', message: 'Esta cédula no figura en el padrón de Higüey.' },
        }),
    });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: messages.admin.usuarios.appoint }));
    await user.type(screen.getByLabelText(text.cedulaLabel), '9999999999-9');
    await user.click(screen.getByRole('button', { name: text.search }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Esta cédula no figura en el padrón de Higüey.',
    );
  });

  it('only offers "coordinador general" to a superadmin', async () => {
    routeFetch({
      '/api/me': () => jsonResponse(200, meWithRole('general_coordinator')),
      '/api/voters/': () => jsonResponse(200, voterCard),
      '/api/sectors': () => jsonResponse(200, sectors),
    });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: messages.admin.usuarios.appoint }));
    await user.type(screen.getByLabelText(text.cedulaLabel), '0029876543-2');
    await user.click(screen.getByRole('button', { name: text.search }));
    await screen.findByText('PEDRO GÓMEZ');

    expect(screen.queryByText(messages.roles.general_coordinator)).toBeNull();
  });

  it('does not ask for a phone number when the voter is already a member', async () => {
    const memberCard: VoterCard = {
      ...voterCard,
      membership: { status: 'member', level: 'member', leaderName: null },
    };
    routeFetch({
      '/api/me': () => jsonResponse(200, meWithRole('superadmin')),
      '/api/voters/': () => jsonResponse(200, memberCard),
      '/api/sectors': () => jsonResponse(200, sectors),
      '/api/users': () => jsonResponse(201, { id: 'new-user' }),
    });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: messages.admin.usuarios.appoint }));
    await user.type(screen.getByLabelText(text.cedulaLabel), '0029876543-2');
    await user.click(screen.getByRole('button', { name: text.search }));
    await screen.findByText('PEDRO GÓMEZ');

    expect(screen.queryByLabelText(text.phoneLabel)).toBeNull();

    await user.click(screen.getByRole('button', { name: text.submit }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const appointCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === 'string' ? input : (input as Request).url).includes('/api/users'),
    );
    const body = JSON.parse((appointCall?.[1]?.body as string) ?? '{}') as Record<string, unknown>;
    expect(body.phone).toBeUndefined();
  });

  it('appoints the coordinator and closes the dialog', async () => {
    routeFetch({
      '/api/me': () => jsonResponse(200, meWithRole('superadmin')),
      '/api/voters/': () => jsonResponse(200, voterCard),
      '/api/sectors': () => jsonResponse(200, sectors),
      '/api/users': () => jsonResponse(201, { id: 'new-user' }),
    });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: messages.admin.usuarios.appoint }));
    await user.type(screen.getByLabelText(text.cedulaLabel), '0029876543-2');
    await user.click(screen.getByRole('button', { name: text.search }));
    await screen.findByText('PEDRO GÓMEZ');
    await user.type(screen.getByLabelText(text.phoneLabel), '8095551234');

    await user.click(screen.getByRole('button', { name: text.submit }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const appointCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === 'string' ? input : (input as Request).url).includes('/api/users'),
    );
    expect(appointCall).toBeDefined();
  });
});
