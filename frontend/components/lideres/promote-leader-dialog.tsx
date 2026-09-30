'use client';

import type { LeaderListItem } from '@heribertova/shared';
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

const text = messages.lideres.promoteDialog;

/** "Promover a líder de equipo" on an aspirant's card (plan 6.1): the manual override for a
 * superadmin/general coordinator to promote before the member-count threshold is met, via
 * `POST /api/promotions/:personId/promote`. */
export function PromoteLeaderDialog({
  leader,
  onOpenChange,
}: {
  leader: LeaderListItem;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const reasonId = useId();
  const [reason, setReason] = useState('');

  const promote = useMutation({
    mutationFn: () => api.promoteManual(leader.id, { reason: reason.trim() }),
    onSuccess: async () => {
      toast.success(messages.lideres.success.promoted);
      await queryClient.invalidateQueries({ queryKey: ['leaders'] });
      onOpenChange(false);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim()) promote.mutate();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title(leader.fullName)}</DialogTitle>
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

          {promote.isError && (
            <p role="alert" className="text-sm text-destructive">
              {promote.error instanceof ApiError ? promote.error.message : messages.errors.generic}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {text.cancel}
            </Button>
            <Button type="submit" disabled={!reason.trim() || promote.isPending}>
              {promote.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {promote.isPending ? text.submitting : text.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
