'use client';

import type { PersonSummary } from '@heribertova/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.equipo.deleteDialog;

/** "Eliminar" on a member row (plan 5.3): a soft delete, which `DELETE /api/people/:id` requires a
 * reason for (kept for the audit trail) and refuses while the person still leads a team. */
export function DeletePersonDialog({
  person,
  onOpenChange,
}: {
  person: PersonSummary;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const reasonId = useId();
  const [reason, setReason] = useState('');

  const remove = useMutation({
    mutationFn: () => api.deletePerson(person.id, reason.trim()),
    onSuccess: async () => {
      toast.success(messages.equipo.success.deleted);
      await queryClient.invalidateQueries({ queryKey: ['people'] });
      onOpenChange(false);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim()) remove.mutate();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title(person.fullName)}</DialogTitle>
          <DialogDescription>{text.body}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor={reasonId} className="text-sm font-medium">
              {text.reasonLabel}
            </label>
            <Input
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              autoFocus
            />
          </div>

          {remove.isError && (
            <p role="alert" className="text-sm text-destructive">
              {remove.error instanceof ApiError ? remove.error.message : messages.errors.generic}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {text.cancel}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!reason.trim() || remove.isPending}
            >
              {remove.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {remove.isPending ? text.confirming : text.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
