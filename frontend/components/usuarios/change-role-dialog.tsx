'use client';

import { APPOINTABLE_ROLES, type AppointableRole, type UserSummary } from '@heribertova/shared';
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
import { NativeSelect } from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.admin.usuarios.changeRoleDialog;
const appointText = messages.admin.usuarios.appointDialog;

function otherAppointableRole(role: UserSummary['role']): AppointableRole {
  return role === 'general_coordinator' ? 'recinto_coordinator' : 'general_coordinator';
}

/**
 * "Cambiar rol": moves an existing login (a team leader, an aspirant, or the other coordinator role)
 * straight to a coordinator role, via `PATCH /api/users/:id`. Superadmin-only — `UsersTable` only
 * offers this action to one, and the server enforces it regardless.
 */
export function ChangeRoleDialog({
  user,
  onOpenChange,
}: {
  user: UserSummary;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const recintoScopesId = useId();
  const [role, setRole] = useState<AppointableRole>(otherAppointableRole(user.role));
  const [recintoScopes, setRecintoScopes] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: () =>
      api.updateUser(user.id, {
        role,
        recintoScopes: role === 'recinto_coordinator' ? recintoScopes : undefined,
      }),
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

  const canSubmit = role !== 'recinto_coordinator' || recintoScopes.length > 0;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title(user.person.fullName)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{appointText.roleLabel}</span>
            <NativeSelect
              value={role}
              onChange={(event) => setRole(event.target.value as AppointableRole)}
            >
              {APPOINTABLE_ROLES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {messages.roles[candidate]}
                </option>
              ))}
            </NativeSelect>
          </div>

          {role === 'recinto_coordinator' && (
            <div className="flex flex-col gap-2">
              <p id={recintoScopesId} className="text-sm font-medium">
                {appointText.recintoScopesLabel}
              </p>
              <RecintoPicker
                labelledBy={recintoScopesId}
                value={recintoScopes}
                onChange={setRecintoScopes}
              />
              <p className="text-sm text-muted-foreground">{appointText.recintoScopesHint}</p>
            </div>
          )}

          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {save.error instanceof ApiError ? save.error.message : messages.errors.generic}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {text.cancel}
            </Button>
            <Button type="submit" disabled={!canSubmit || save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {save.isPending ? text.saving : text.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
