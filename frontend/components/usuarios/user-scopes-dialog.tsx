'use client';

import type { UserSummary } from '@heribertova/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { RecintoPicker } from '@/components/usuarios/recinto-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.admin.usuarios.scopesDialog;

/** Edits a recinto coordinator's `recintoScopes` (plan 4.3), via `PATCH /api/users/:id`. */
export function UserScopesDialog({
  user,
  onOpenChange,
}: {
  user: UserSummary;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const recintoScopesId = useId();
  const [recintoScopes, setRecintoScopes] = useState(user.recintoScopes);

  const save = useMutation({
    mutationFn: () => api.updateUser(user.id, { recintoScopes }),
    onSuccess: async () => {
      toast.success(messages.admin.usuarios.success.updated);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      onOpenChange(false);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title(user.person.fullName)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <label htmlFor={recintoScopesId} className="sr-only">
            {messages.admin.usuarios.appointDialog.recintoScopesLabel}
          </label>
          <RecintoPicker id={recintoScopesId} value={recintoScopes} onChange={setRecintoScopes} />
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {save.error instanceof ApiError ? save.error.message : messages.errors.generic}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={recintoScopes.length === 0 || save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {save.isPending ? text.saving : text.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
