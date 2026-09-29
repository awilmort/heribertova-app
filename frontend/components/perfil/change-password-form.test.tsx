// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { ChangePasswordForm } from './change-password-form';

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

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
    body === null
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
  );
}

function validationError(field: 'currentPassword' | 'newPassword', message: string) {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Los datos enviados no son válidos.',
      fields: { [`body.${field}`]: [message] },
    },
  };
}

function renderForm(role: 'team_leader' | 'superadmin' = 'team_leader') {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ChangePasswordForm role={role} />
    </QueryClientProvider>,
  );
  return {
    current: screen.getByLabelText(messages.perfil.changePassword.currentPasswordLabel),
    next: screen.getByLabelText(messages.perfil.changePassword.newPasswordLabel),
    submit: screen.getByRole('button', { name: messages.perfil.changePassword.submit }),
  };
}

describe('ChangePasswordForm', () => {
  it('shows the minimum length for the role (8, or 14 for the superadmin)', () => {
    renderForm('team_leader');
    expect(screen.getByText('Debe tener al menos 8 caracteres.')).toBeDefined();
  });

  it('shows 14 characters as the minimum for the superadmin', () => {
    renderForm('superadmin');
    expect(screen.getByText('Debe tener al menos 14 caracteres.')).toBeDefined();
  });

  it('disables submit until both fields meet the minimum length', async () => {
    const user = userEvent.setup();
    const { current, next, submit } = renderForm('team_leader');
    expect(submit).toHaveProperty('disabled', true);

    await user.type(current, 'old-password');
    expect(submit).toHaveProperty('disabled', true);

    await user.type(next, 'short');
    expect(submit).toHaveProperty('disabled', true);

    await user.type(next, '-enough');
    expect(submit).toHaveProperty('disabled', false);
  });

  it('clears both fields on success', async () => {
    respond(204, null);
    const user = userEvent.setup();
    const { current, next, submit } = renderForm();
    await user.type(current, 'old-password');
    await user.type(next, 'new-password-1');
    await user.click(submit);

    await vi.waitFor(() => expect(current).toHaveProperty('value', ''));
    expect(next).toHaveProperty('value', '');
  });

  it('shows the wrong-current-password error under that field only', async () => {
    respond(400, validationError('currentPassword', 'La contraseña actual no es correcta.'));
    const user = userEvent.setup();
    const { current, next, submit } = renderForm();
    await user.type(current, 'wrong-password');
    await user.type(next, 'new-password-1');
    await user.click(submit);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'La contraseña actual no es correcta.',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('shows the new-password rejection (e.g. it is the birth date) under that field', async () => {
    respond(
      400,
      validationError('newPassword', 'La nueva contraseña no puede ser su fecha de nacimiento.'),
    );
    const user = userEvent.setup();
    const { current, next, submit } = renderForm();
    await user.type(current, 'old-password');
    await user.type(next, 'new-password-1');
    await user.click(submit);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'La nueva contraseña no puede ser su fecha de nacimiento.',
    );
  });

  it('shows a general error when the failure has no field', async () => {
    respond(429, {
      error: { code: 'RATE_LIMITED', message: 'Demasiados intentos. Intente más tarde.' },
    });
    const user = userEvent.setup();
    const { current, next, submit } = renderForm();
    await user.type(current, 'old-password');
    await user.type(next, 'new-password-1');
    await user.click(submit);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Demasiados intentos. Intente más tarde.',
    );
  });
});
