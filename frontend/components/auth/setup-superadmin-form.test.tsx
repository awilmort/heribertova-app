// @vitest-environment jsdom
import { SUPERADMIN_PASSWORD_MIN_LENGTH } from '@heribertova/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { SetupSuperadminForm } from './setup-superadmin-form';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const text = messages.setup;
const PASSWORD = 'x'.repeat(SUPERADMIN_PASSWORD_MIN_LENGTH);

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.unstubAllGlobals();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    body === null
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
  );
}

function apiError(code: string, message: string, fields?: Record<string, string[]>) {
  return { error: { code, message, fields } };
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SetupSuperadminForm />
    </QueryClientProvider>,
  );
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, password = PASSWORD) {
  await user.type(screen.getByLabelText(text.fields.cedula), '00112345673');
  await user.type(screen.getByLabelText(text.fields.fullName), 'JUAN PÉREZ');
  await user.type(screen.getByLabelText(text.fields.birthDate), '1985-03-15');
  await user.type(screen.getByLabelText(text.fields.phone), '8095551234');
  await user.type(screen.getByLabelText(text.fields.recintoName), 'LICEO CENTRO');
  await user.type(screen.getByLabelText(text.fields.sector), 'CENTRO');
  await user.type(screen.getByLabelText(text.fields.password), password);
  await user.type(screen.getByLabelText(text.fields.passwordConfirm), password);
}

describe('SetupSuperadminForm', () => {
  it('keeps the submit button disabled until every field is valid and the passwords match', async () => {
    renderForm();
    const user = userEvent.setup();
    const submit = screen.getByRole('button', { name: text.submit });
    expect(submit).toHaveProperty('disabled', true);

    await fillForm(user);
    expect(submit).toHaveProperty('disabled', false);
  });

  it('disables submit and shows a hint when the passwords do not match', async () => {
    renderForm();
    const user = userEvent.setup();
    await fillForm(user, PASSWORD);
    await user.clear(screen.getByLabelText(text.fields.passwordConfirm));
    await user.type(screen.getByLabelText(text.fields.passwordConfirm), `${PASSWORD}x`);

    expect(screen.getByText(text.passwordMismatch)).toBeDefined();
    expect(screen.getByRole('button', { name: text.submit })).toHaveProperty('disabled', true);
  });

  it('creates the superadmin and redirects to /login on success', async () => {
    respond(204, null);
    renderForm();
    const user = userEvent.setup();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: text.submit }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/setup/superadmin',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          cedula: '00112345673',
          fullName: 'JUAN PÉREZ',
          birthDate: '1985-03-15',
          phone: '8095551234',
          phoneWhatsapp: true,
          recintoName: 'LICEO CENTRO',
          sector: 'CENTRO',
          password: PASSWORD,
        }),
      }),
    );
  });

  it('shows a field error next to the password when the server refuses it', async () => {
    respond(
      400,
      apiError('VALIDATION_ERROR', 'Los datos enviados no son válidos.', {
        'body.password': ['La nueva contraseña no puede ser su fecha de nacimiento.'],
      }),
    );
    renderForm();
    const user = userEvent.setup();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: text.submit }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'La nueva contraseña no puede ser su fecha de nacimiento.',
    );
    expect(push).not.toHaveBeenCalled();
  });
});
