// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/messages/es';
import { PasswordChangeDialog } from './password-change-dialog';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  push.mockReset();
  sessionStorage.clear();
});

describe('PasswordChangeDialog', () => {
  it('opens automatically when the password is still the default', async () => {
    render(<PasswordChangeDialog usingDefaultPassword={true} />);
    expect(await screen.findByRole('dialog')).toBeDefined();
    expect(screen.getByText(messages.auth.passwordChange.dialogTitle)).toBeDefined();
  });

  it('never opens once the password has been changed', () => {
    render(<PasswordChangeDialog usingDefaultPassword={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on "Ahora no" and does not reopen for the rest of the session', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PasswordChangeDialog usingDefaultPassword={true} />);
    await user.click(
      await screen.findByRole('button', { name: messages.auth.passwordChange.skip }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(<PasswordChangeDialog usingDefaultPassword={true} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends the user to /perfil on "Cambiar ahora"', async () => {
    const user = userEvent.setup();
    render(<PasswordChangeDialog usingDefaultPassword={true} />);
    await user.click(
      await screen.findByRole('button', { name: messages.auth.passwordChange.changeNow }),
    );
    expect(push).toHaveBeenCalledWith('/perfil');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
