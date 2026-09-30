// @vitest-environment jsdom
import type { NominationResponse, PromotionSettings } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { NominateAspirantDialog } from './nominate-aspirant-dialog';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const text = messages.lideres.nominateDialog;

const settings: PromotionSettings = {
  nominationMinInitialMembers: 2,
  autoPromotionThreshold: 8,
  teamGoal: 20,
  maxOpenAspirantsPerNominator: 1,
};

const eligibleNew = {
  eligible: true,
  fullName: 'JUAN PÉREZ SANTANA',
  recintoKey: 'liceo--centro-ciudad',
  recintoName: 'LICEO JUAN PABLO DUARTE',
  colegioId: 4675,
  sector: 'CENTRO CIUDAD',
  checkDigitValid: true,
};

const alreadyRegistered = {
  eligible: false,
  code: 'already_registered' as const,
  reason: 'Ya está registrado(a).',
  leaderName: null,
};

const nominationResult: NominationResponse = { personId: 'p1', userId: 'u1' };

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => `key-${Math.random()}` });
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

function routeFetch(checkResult: unknown) {
  fetchMock.mockImplementation((input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('/api/settings/promotion'))
      return Promise.resolve(jsonResponse(200, settings));
    if (url.includes('/api/people/check')) return Promise.resolve(jsonResponse(200, checkResult));
    if (url.includes('/api/promotions/nominations')) {
      return Promise.resolve(jsonResponse(201, nominationResult));
    }
    throw new Error(`Unhandled request: ${url}`);
  });
}

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NominateAspirantDialog />
    </QueryClientProvider>,
  );
}

async function goToFormStep(user: ReturnType<typeof userEvent.setup>, fullNameToWaitFor: string) {
  await user.click(screen.getByRole('button', { name: messages.lideres.nominate }));
  await user.type(screen.getByLabelText(text.cedulaLabel), '00112345672');
  await user.click(screen.getByRole('button', { name: text.search }));
  await screen.findByText(fullNameToWaitFor);
}

/** Fills draft #`index` (0-based) with a valid cédula/phone and checks its consent box. */
async function fillDraft(user: ReturnType<typeof userEvent.setup>, index: number, cedula: string) {
  const cedulaInputs = screen.getAllByLabelText(text.memberCedulaLabel);
  const phoneInputs = screen.getAllByLabelText(text.memberPhoneLabel);
  const consentCheckboxes = screen.getAllByLabelText(text.memberConsentLabel);
  await user.type(cedulaInputs[index]!, cedula);
  await user.type(phoneInputs[index]!, '8095551234');
  await user.click(consentCheckboxes[index]!);
}

describe('NominateAspirantDialog', () => {
  it('keeps the submit button disabled until enough initial members are complete', async () => {
    routeFetch(eligibleNew);
    const user = userEvent.setup();
    renderDialog();

    await goToFormStep(user, eligibleNew.fullName);
    await screen.findByText(text.initialMembersHint(2));

    const submit = screen.getByRole('button', { name: text.submit });
    expect(submit).toHaveProperty('disabled', true);

    await fillDraft(user, 0, '00298765432');
    expect(submit).toHaveProperty('disabled', true);
    await screen.findByText(text.initialMembersHint(1));

    await fillDraft(user, 1, '00376543210');
    await user.type(screen.getByLabelText(text.phoneLabel), '8095551234');

    expect(await screen.findByText(text.initialMembersHint(0))).toBeDefined();
    expect(submit).toHaveProperty('disabled', false);
  });

  it('sends the nominee phone for a new nominee, but omits it for an already-registered one', async () => {
    routeFetch(alreadyRegistered);
    const user = userEvent.setup();
    renderDialog();

    await goToFormStep(user, text.alreadyMember);
    await fillDraft(user, 0, '00298765432');
    await fillDraft(user, 1, '00376543210');

    // No "Teléfono del nominado(a)" field for an already-registered nominee.
    expect(screen.queryByLabelText(text.phoneLabel)).toBeNull();

    await user.click(screen.getByRole('button', { name: text.submit }));
    // The dialog closes on a successful nomination: wait for its title to disappear rather than
    // for the trigger button, which is always in the DOM and so isn't a reliable sync point.
    await waitFor(() => expect(screen.queryByRole('heading', { name: text.title })).toBeNull());

    const nominationCall = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      return url.includes('/api/promotions/nominations');
    });
    expect(nominationCall).toBeDefined();
    const body = JSON.parse((nominationCall?.[1]?.body as string) ?? '{}') as {
      nomineePhone?: string;
    };
    expect(body.nomineePhone).toBeUndefined();
  });
});
