// @vitest-environment jsdom
import type { PersonDetail } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { NewPersonDialog } from './new-person-dialog';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const text = messages.equipo.newMemberDialog;

const eligible = {
  eligible: true,
  fullName: 'JUAN PÉREZ SANTANA',
  recintoKey: 'liceo--centro-ciudad',
  recintoName: 'LICEO JUAN PABLO DUARTE',
  colegioId: 4675,
  sector: 'CENTRO CIUDAD',
  checkDigitValid: true,
};

const created: PersonDetail = {
  id: 'p1',
  cedula: '00112345672',
  fullName: 'JUAN PÉREZ SANTANA',
  nickname: null,
  recintoName: 'LICEO JUAN PABLO DUARTE',
  sector: 'CENTRO CIUDAD',
  level: 'member',
  status: null,
  docStatus: 'pending',
  photos: { cedula: false, selfie: false },
  voterInactive: false,
  createdAt: new Date().toISOString(),
  phone: '8095551234',
  phoneWhatsapp: true,
  phone2: null,
  phone2Whatsapp: null,
  email: null,
  leaderId: null,
  recintoKey: 'liceo--centro-ciudad',
  colegioId: 4675,
  validatedAt: null,
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

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NewPersonDialog />
    </QueryClientProvider>,
  );
}

/** Fills and submits the cédula-check step, up to the eligible "form" step being visible. */
async function goToFormStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: messages.equipo.newMember }));
  await user.type(screen.getByLabelText(text.cedulaLabel), '00112345672');
  await user.click(screen.getByRole('button', { name: text.search }));
  await screen.findByText(eligible.fullName);
}

describe('NewPersonDialog', () => {
  it('registers a member after an eligible check, then moves to the photo step', async () => {
    fetchMock.mockImplementation((input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/people/check')) return Promise.resolve(jsonResponse(200, eligible));
      if (url.includes('/api/people')) return Promise.resolve(jsonResponse(201, created));
      throw new Error(`Unhandled request: ${url}`);
    });
    const user = userEvent.setup();
    renderDialog();

    await goToFormStep(user);
    await user.type(screen.getByLabelText(text.phoneLabel), '8095551234');
    await user.click(screen.getByLabelText(text.consentLabel));
    await user.click(screen.getByRole('button', { name: text.save }));

    expect(await screen.findByText(text.savedNote)).toBeDefined();
  });

  it('retries a failed submit with the same Idempotency-Key, never creating a second member', async () => {
    let registerAttempts = 0;
    fetchMock.mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/people/check')) return Promise.resolve(jsonResponse(200, eligible));
      if (url.includes('/api/people')) {
        registerAttempts += 1;
        if (registerAttempts === 1) {
          return Promise.resolve(
            jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
          );
        }
        return Promise.resolve(jsonResponse(201, created));
      }
      throw new Error(`Unhandled request: ${url} ${JSON.stringify(init)}`);
    });
    const user = userEvent.setup();
    renderDialog();

    await goToFormStep(user);
    await user.type(screen.getByLabelText(text.phoneLabel), '8095551234');
    await user.click(screen.getByLabelText(text.consentLabel));
    await user.click(screen.getByRole('button', { name: text.save }));

    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: text.save }));
    await screen.findByText(text.savedNote);

    expect(registerAttempts).toBe(2);
    const registerCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      return url.endsWith('/api/people');
    });
    expect(registerCalls).toHaveLength(2);
    const keys = registerCalls.map(
      ([, init]) => (init?.headers as Record<string, string>)['Idempotency-Key'],
    );
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
  });
});
