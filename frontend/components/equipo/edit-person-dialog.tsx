'use client';

import {
  phoneDigits,
  phoneSchema,
  type PersonDetail,
  type PersonSummary,
} from '@heribertova/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.equipo.editDialog;
const fieldText = messages.equipo.newMemberDialog;

/** "Editar" on a member row (plan 5.3): the contact fields `PATCH /api/people/:id` accepts. The
 * list only carries `PersonSummary` (no contact fields), so this loads the full record first. */
export function EditPersonDialog({
  person,
  onOpenChange,
}: {
  person: PersonSummary;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: detail, isPending: loading } = useQuery({
    queryKey: ['person', person.id],
    queryFn: () => api.getPerson(person.id),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title(person.fullName)}</DialogTitle>
        </DialogHeader>

        {loading || !detail ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : (
          <EditPersonForm detail={detail} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only once `detail` has loaded, so its fields start from the real values without an
 * effect syncing them in after the fact. */
function EditPersonForm({
  detail,
  onOpenChange,
}: {
  detail: PersonDetail;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const nicknameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const [nickname, setNickname] = useState(detail.nickname ?? '');
  const [phone, setPhone] = useState(detail.phone);
  const [email, setEmail] = useState(detail.email ?? '');

  const update = useMutation({
    mutationFn: () =>
      api.updatePerson(detail.id, {
        nickname: nickname.trim() || null,
        phone: phoneDigits(phone),
        email: email.trim() || null,
      }),
    onSuccess: async () => {
      toast.success(messages.equipo.success.updated);
      await queryClient.invalidateQueries({ queryKey: ['people'] });
      onOpenChange(false);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update.mutate();
  }

  const phoneValid = phoneSchema.safeParse(phoneDigits(phone)).success;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor={nicknameId} className="text-sm font-medium">
          {fieldText.nicknameLabel}
        </label>
        <Input
          id={nicknameId}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={phoneId} className="text-sm font-medium">
          {fieldText.phoneLabel}
        </label>
        <Input
          id={phoneId}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          inputMode="numeric"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={emailId} className="text-sm font-medium">
          {fieldText.emailLabel}
        </label>
        <Input
          id={emailId}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      {update.isError && (
        <p role="alert" className="text-sm text-destructive">
          {update.error instanceof ApiError ? update.error.message : messages.errors.generic}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {text.cancel}
        </Button>
        <Button type="submit" disabled={!phoneValid || update.isPending}>
          {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {update.isPending ? text.saving : text.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
