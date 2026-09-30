'use client';

import type { RecintoCoverageItem } from '@heribertova/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
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

const text = messages.recintos.assignDialog;

/**
 * "Asignar" (plan 7.2): which recinto_coordinators cover `recinto`, via
 * `PUT /api/recintos/:key/coordinators`. The multi-select of coordinators is inlined here rather
 * than factored out like `usuarios/recinto-picker.tsx` — that one has two real callers (the appoint
 * dialog and the per-user scopes dialog), this one has exactly one.
 */
export function AssignCoordinatorsDialog({
  recinto,
  onOpenChange,
}: {
  recinto: RecintoCoverageItem;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const pickerId = useId();
  const [coordinatorUserIds, setCoordinatorUserIds] = useState(
    recinto.coordinators.map((coordinator) => coordinator.id),
  );

  const { data: coordinators } = useQuery({
    queryKey: ['users', { role: 'recinto_coordinator' }],
    queryFn: () => api.listUsers({ role: 'recinto_coordinator', pageSize: 100 }),
  });

  const save = useMutation({
    mutationFn: () => api.assignRecintoCoordinators(recinto.key, { coordinatorUserIds }),
    onSuccess: async () => {
      toast.success(messages.recintos.success.assigned);
      await queryClient.invalidateQueries({ queryKey: ['recintos'] });
      onOpenChange(false);
    },
  });

  function handlePickerChange(event: ChangeEvent<HTMLSelectElement>) {
    setCoordinatorUserIds(Array.from(event.target.selectedOptions, (option) => option.value));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title(recinto.name)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <label htmlFor={pickerId} className="text-sm font-medium">
            {text.coordinatorsLabel}
          </label>
          {coordinators && coordinators.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{text.empty}</p>
          ) : (
            <NativeSelect
              id={pickerId}
              multiple
              value={coordinatorUserIds}
              onChange={handlePickerChange}
            >
              {coordinators?.items.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.person.fullName}
                </option>
              ))}
            </NativeSelect>
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
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {save.isPending ? text.saving : text.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
