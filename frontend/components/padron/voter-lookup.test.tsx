// @vitest-environment jsdom
import type { VoterCard } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { VoterLookup } from './voter-lookup';

/** A cédula whose check digit is right, and the same with the last digit wrong. */
const CEDULA = '00112345673';
const BAD_CHECK_DIGIT = '00112345672';

const voter: VoterCard = {
  cedula: CEDULA,
  fullName: 'MARÍA ALTAGRACIA RODRÍGUEZ',
  age: 41,
  birthDay: 15,
  birthMonth: 6,
  sector: 'CENTRO CIUDAD',
  recintoKey: 'liceo-juan-pablo-duarte--centro-ciudad',
  recintoName: 'LICEO JUAN PABLO DUARTE',
  colegioId: 4675,
  membership: { status: 'none' },
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function apiError(code: string, message: string) {
  return { error: { code, message } };
}

function renderLookup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <VoterLookup />
    </QueryClientProvider>,
  );
  return {
    input: screen.getByLabelText(messages.padron.cedulaLabel),
    submit: screen.getByRole('button', { name: messages.padron.submit }),
  };
}

async function search(cedula: string) {
  const user = userEvent.setup();
  const { input, submit } = renderLookup();
  await user.type(input, cedula);
  await user.click(submit);
}

describe('VoterLookup', () => {
  it('masks the cédula as it is typed and enables the search at 11 digits', async () => {
    const user = userEvent.setup();
    const { input, submit } = renderLookup();

    await user.type(input, '0011234567');
    expect(input).toHaveProperty('value', '001-1234567');
    expect(submit).toHaveProperty('disabled', true);

    await user.type(input, '3');
    expect(input).toHaveProperty('value', '001-1234567-3');
    expect(submit).toHaveProperty('disabled', false);
  });

  it('shows the padrón card of a voter who is found', async () => {
    respond(200, voter);
    await search(CEDULA);

    expect(await screen.findByRole('heading', { name: voter.fullName })).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(`/api/voters/${CEDULA}`, expect.anything());
    for (const value of [
      '001-1234567-3',
      '41 años',
      '15 de junio',
      'CENTRO CIUDAD',
      'LICEO JUAN PABLO DUARTE',
      'Colegio 4675',
      messages.padron.membership.none,
    ]) {
      expect(screen.getByText(value)).toBeDefined();
    }
  });

  it('shows the level and leader of a member in scope', async () => {
    respond(200, {
      ...voter,
      membership: { status: 'member', level: 'team_leader', leaderName: 'JUAN PÉREZ' },
    });
    await search(CEDULA);

    expect(await screen.findByText('Ya es miembro · Líder de equipo')).toBeDefined();
    expect(screen.getByText('JUAN PÉREZ')).toBeDefined();
  });

  it('only says a member out of scope is registered', async () => {
    respond(200, { ...voter, membership: { status: 'out_of_scope' } });
    await search(CEDULA);

    expect(await screen.findByText(messages.padron.membership.out_of_scope)).toBeDefined();
    expect(screen.queryByText(messages.padron.fields.leader)).toBeNull();
  });

  it('says so when the cédula is not in the padrón', async () => {
    respond(404, apiError('NOT_FOUND', 'Esta cédula no figura en el padrón de Higüey.'));
    await search(CEDULA);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Esta cédula no figura en el padrón de Higüey.',
    );
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('explains when the daily quota is used up', async () => {
    const quota =
      'Alcanzó el límite de 300 consultas del padrón por día. Podrá consultar de nuevo mañana.';
    respond(429, apiError('RATE_LIMITED', quota));
    await search(CEDULA);

    expect((await screen.findByRole('alert')).textContent).toBe(quota);
  });

  it('shows a generic error when the server cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await search(CEDULA);

    expect((await screen.findByRole('alert')).textContent).toBe(messages.errors.generic);
  });

  it('warns about a wrong check digit but still searches', async () => {
    respond(200, { ...voter, cedula: BAD_CHECK_DIGIT });
    const user = userEvent.setup();
    const { input, submit } = renderLookup();

    await user.type(input, BAD_CHECK_DIGIT);
    expect(screen.getByText(messages.padron.checkDigitWarning)).toBeDefined();
    await user.click(submit);

    expect(await screen.findByRole('heading', { name: voter.fullName })).toBeDefined();
  });
});
