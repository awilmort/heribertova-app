'use client';

import {
  phoneDigits,
  phoneSchema,
  PERSON_STATUSES,
  type PersonDetail,
  type PersonStatus,
  type PersonSummary,
} from '@heribertova/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PhotoSlot } from '@/components/equipo/photo-slot';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.equipo.validateDrawer;
const fieldText = messages.equipo.newMemberDialog;

/** "Validar miembro" (plan 5.4, `people.validate` only): edit contact details and status, view and
 * replace photos, and mark the member validated. Same "load the full record first" shape as
 * `EditPersonDialog`, since the list only carries `PersonSummary`. */
export function ValidatePersonDrawer({
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
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{text.title(person.fullName)}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {loading || !detail ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : (
            <ValidatePersonForm detail={detail} onOpenChange={onOpenChange} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Mounted only once `detail` has loaded, so its fields start from the real values without an
 * effect syncing them in after the fact (same reasoning as `EditPersonDialog`'s split). */
function ValidatePersonForm({
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
  const statusId = useId();
  const [nickname, setNickname] = useState(detail.nickname ?? '');
  const [phone, setPhone] = useState(detail.phone);
  const [email, setEmail] = useState(detail.email ?? '');
  const [status, setStatus] = useState<PersonStatus>(detail.status ?? 'confirmed');
  const [photos, setPhotos] = useState(detail.photos);

  const save = useMutation({
    mutationFn: () =>
      api.updatePerson(detail.id, {
        nickname: nickname.trim() || null,
        phone: phoneDigits(phone),
        email: email.trim() || null,
        status,
      }),
    onSuccess: async () => {
      toast.success(messages.equipo.success.updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['people'] }),
        queryClient.invalidateQueries({ queryKey: ['person', detail.id] }),
      ]);
      onOpenChange(false);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  const phoneValid = phoneSchema.safeParse(phoneDigits(phone)).success;

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
      {detail.validatedAt && (
        <p className="text-sm text-muted-foreground">
          {text.validatedNote(new Date(detail.validatedAt).toLocaleDateString('es-DO'))}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={statusId} className="text-sm font-medium">
          {text.statusLabel}
        </label>
        <NativeSelect
          id={statusId}
          value={status}
          onChange={(event) => setStatus(event.target.value as PersonStatus)}
        >
          {PERSON_STATUSES.map((candidate) => (
            <option key={candidate} value={candidate}>
              {messages.equipo.status[candidate]}
            </option>
          ))}
        </NativeSelect>
      </div>

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

      <div className="flex flex-col gap-3 border-t pt-4">
        <p className="text-sm font-medium">{text.photosTitle}</p>
        <PhotoSlot
          personId={detail.id}
          kind="cedula"
          hasPhoto={photos.cedula}
          onUploaded={(updated) => setPhotos(updated.photos)}
        />
        <PhotoSlot
          personId={detail.id}
          kind="selfie"
          hasPhoto={photos.selfie}
          onUploaded={(updated) => setPhotos(updated.photos)}
        />
      </div>

      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {save.error instanceof ApiError ? save.error.message : messages.errors.generic}
        </p>
      )}

      <SheetFooter className="mt-auto px-0">
        <Button type="submit" disabled={!phoneValid || save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {save.isPending ? text.saving : text.save}
        </Button>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {text.cancel}
        </Button>
      </SheetFooter>
    </form>
  );
}
