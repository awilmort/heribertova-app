'use client';

import { minPasswordLength, type Role } from '@heribertova/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.perfil.changePassword;

function fieldError(error: Error | null, field: 'currentPassword' | 'newPassword'): string | null {
  if (!(error instanceof ApiError)) return null;
  return error.fields?.[`body.${field}`]?.[0] ?? null;
}

/** `/perfil`'s "Cambiar contraseña" form (plan 3.4), wired to `PUT /api/me/password` (plan 3.2). */
export function ChangePasswordForm({ role }: { role: Role }) {
  const queryClient = useQueryClient();
  const currentId = useId();
  const newId = useId();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const change = useMutation({
    mutationFn: api.changePassword,
    onSuccess: async () => {
      setCurrentPassword('');
      setNewPassword('');
      toast.success(text.success);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const minLength = minPasswordLength(role);
  const complete = currentPassword.length > 0 && newPassword.length >= minLength;
  const currentPasswordError = fieldError(change.error, 'currentPassword');
  const newPasswordError = fieldError(change.error, 'newPassword');
  const generalError =
    change.isError && !currentPasswordError && !newPasswordError
      ? change.error instanceof ApiError
        ? change.error.message
        : messages.errors.generic
      : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (complete) change.mutate({ currentPassword, newPassword });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor={currentId} className="text-sm font-medium">
          {text.currentPasswordLabel}
        </label>
        <PasswordInput
          id={currentId}
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          aria-invalid={currentPasswordError ? true : undefined}
        />
        {currentPasswordError && (
          <p role="alert" className="text-sm text-destructive">
            {currentPasswordError}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={newId} className="text-sm font-medium">
          {text.newPasswordLabel}
        </label>
        <PasswordInput
          id={newId}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
          aria-invalid={newPasswordError ? true : undefined}
        />
        <p className="text-sm text-muted-foreground">{text.minLengthHint(minLength)}</p>
        {newPasswordError && (
          <p role="alert" className="text-sm text-destructive">
            {newPasswordError}
          </p>
        )}
      </div>
      {generalError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          {generalError}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="h-11 self-start"
        disabled={!complete || change.isPending}
      >
        {change.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {change.isPending ? text.saving : text.submit}
      </Button>
    </form>
  );
}
