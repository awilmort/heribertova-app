// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { LoginForm } from './login-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const fetchMock = vi.fn<typeof fetch>();

function stubTurnstile() {
  const options: {
    current?: { callback: (t: string) => void; 'expired-callback': () => void };
  } = {};
  vi.stubGlobal('turnstile', {
    render: vi.fn((_el: HTMLElement, opts: NonNullable<typeof options.current>) => {
      options.current = opts;
      return 'widget-1';
    }),
    remove: vi.fn(),
  });
  return options;
}

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

function apiError(code: string, message: string) {
  return { error: { code, message } };
}

function renderForm(next?: string) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LoginForm nonce="test-nonce" next={next} />
    </QueryClientProvider>,
  );
}

async function fillCredentials(turnstileOptions: ReturnType<typeof stubTurnstile>) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(messages.auth.login.cedulaLabel), '00112345673');
  await user.type(screen.getByLabelText(messages.auth.login.passwordLabel), 'my-password');
  act(() => {
    turnstileOptions.current?.callback('turnstile-token');
  });
  return user;
}

describe('LoginForm', () => {
  it('keeps the submit button disabled until cédula, password and Turnstile are all done', async () => {
    const turnstile = stubTurnstile();
    renderForm();
    const submit = screen.getByRole('button', { name: messages.auth.login.submit });
    expect(submit).toHaveProperty('disabled', true);

    await fillCredentials(turnstile);
    expect(submit).toHaveProperty('disabled', false);
  });

  it('logs in directly (204) and redirects to /inicio by default', async () => {
    const turnstile = stubTurnstile();
    respond(204, null);
    renderForm();
    const user = await fillCredentials(turnstile);
    await user.click(screen.getByRole('button', { name: messages.auth.login.submit }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/inicio'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          cedula: '00112345673',
          password: 'my-password',
          turnstileToken: 'turnstile-token',
        }),
      }),
    );
  });

  it('redirects to a safe `next` path after login', async () => {
    const turnstile = stubTurnstile();
    respond(204, null);
    renderForm('/padron');
    const user = await fillCredentials(turnstile);
    await user.click(screen.getByRole('button', { name: messages.auth.login.submit }));

    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith('/padron');
  });

  it('ignores an unsafe `next` (an absolute URL) and falls back to /inicio', async () => {
    const turnstile = stubTurnstile();
    respond(204, null);
    renderForm('https://evil.example/phish');
    const user = await fillCredentials(turnstile);
    await user.click(screen.getByRole('button', { name: messages.auth.login.submit }));

    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith('/inicio');
  });

  it('shows the generic invalid-credentials message on a 401', async () => {
    const turnstile = stubTurnstile();
    respond(
      401,
      apiError(
        'INVALID_CREDENTIALS',
        'No pudimos iniciar su sesión. Verifique su cédula y contraseña e intente nuevamente.',
      ),
    );
    renderForm();
    const user = await fillCredentials(turnstile);
    await user.click(screen.getByRole('button', { name: messages.auth.login.submit }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No pudimos iniciar su sesión. Verifique su cédula y contraseña e intente nuevamente.',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('moves the superadmin to the TOTP step on a 202, then logs in on a valid code', async () => {
    const turnstile = stubTurnstile();
    respond(202, { totpRequired: true });
    renderForm();
    const user = await fillCredentials(turnstile);
    await user.click(screen.getByRole('button', { name: messages.auth.login.submit }));

    const codeInput = await screen.findByLabelText(messages.auth.totp.codeLabel);
    respond(204, null);
    await user.type(codeInput, '123456');
    await user.click(screen.getByRole('button', { name: messages.auth.totp.verify }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/inicio'));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auth/totp/verify',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: '123456' }) }),
    );
  });

  it('shows an error and lets the superadmin retry a wrong TOTP code', async () => {
    const turnstile = stubTurnstile();
    respond(202, { totpRequired: true });
    renderForm();
    const user = await fillCredentials(turnstile);
    await user.click(screen.getByRole('button', { name: messages.auth.login.submit }));

    const codeInput = await screen.findByLabelText(messages.auth.totp.codeLabel);
    respond(
      401,
      apiError(
        'INVALID_TOTP_CODE',
        'El código no es válido. Escriba el código que muestra ahora su aplicación.',
      ),
    );
    await user.type(codeInput, '000000');
    await user.click(screen.getByRole('button', { name: messages.auth.totp.verify }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'El código no es válido. Escriba el código que muestra ahora su aplicación.',
    );
    expect(screen.getByLabelText(messages.auth.totp.codeLabel)).toBeDefined();
  });

  it('returns to the credentials step when the TOTP challenge expired', async () => {
    const turnstile = stubTurnstile();
    respond(202, { totpRequired: true });
    renderForm();
    const user = await fillCredentials(turnstile);
    await user.click(screen.getByRole('button', { name: messages.auth.login.submit }));

    const codeInput = await screen.findByLabelText(messages.auth.totp.codeLabel);
    respond(401, apiError('UNAUTHENTICATED', 'La verificación expiró. Inicie sesión nuevamente.'));
    await user.type(codeInput, '111111');
    await user.click(screen.getByRole('button', { name: messages.auth.totp.verify }));

    expect(await screen.findByLabelText(messages.auth.login.cedulaLabel)).toBeDefined();
    const submit = screen.getByRole('button', { name: messages.auth.login.submit });
    expect(submit).toHaveProperty('disabled', true);
  });
});
