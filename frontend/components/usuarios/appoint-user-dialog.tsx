'use client';

import {
  APPOINTABLE_ROLES,
  cedulaDigits,
  formatCedula,
  isCedula,
  phoneDigits,
  phoneSchema,
  type AppointableRole,
  type VoterCard,
} from '@heribertova/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.admin.usuarios.appointDialog;

/**
 * "Nombrar coordinador" (plan 4.3): looks a cédula up in the padrón (`GET /api/voters/:cedula`,
 * plan 2.2, reused rather than duplicated), then appoints them with `POST /api/users`. `role` only
 * offers `general_coordinator` to a superadmin: a general coordinator cannot appoint a peer, and the
 * server would refuse it anyway (`outranks`).
 */
export function AppointUserDialog() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me });
  const cedulaId = useId();
  const phoneId = useId();
  const recintoScopesId = useId();
  const [open, setOpen] = useState(false);
  const [cedula, setCedula] = useState('');
  const [voter, setVoter] = useState<VoterCard | null>(null);
  const [role, setRole] = useState<AppointableRole>('recinto_coordinator');
  const [recintoScopes, setRecintoScopes] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [phoneWhatsapp, setPhoneWhatsapp] = useState(true);

  const lookup = useMutation({
    mutationFn: api.lookupVoter,
    onSuccess: (card) => {
      setVoter(card);
      setRecintoScopes([card.recintoKey]);
    },
  });

  const appoint = useMutation({
    mutationFn: api.appointUser,
    onSuccess: async () => {
      toast.success(messages.admin.usuarios.success.appointed);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      reset();
      setOpen(false);
    },
  });

  function reset() {
    setCedula('');
    setVoter(null);
    setRole('recinto_coordinator');
    setRecintoScopes([]);
    setPhone('');
    setPhoneWhatsapp(true);
    lookup.reset();
    appoint.reset();
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = cedulaDigits(cedula);
    if (isCedula(digits)) lookup.mutate(digits);
  }

  // An existing member (or someone already registered outside the caller's scope) already has a
  // `people` record with contact details on file; the backend only uses `phone`/`phoneWhatsapp` to
  // create a new one, so there is no need to ask for it again.
  const needsPhone = voter?.membership.status === 'none';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!voter) return;
    appoint.mutate({
      cedula: voter.cedula,
      role,
      recintoScopes: role === 'recinto_coordinator' ? recintoScopes : [],
      phone: needsPhone ? phoneDigits(phone) : undefined,
      phoneWhatsapp: needsPhone ? phoneWhatsapp : undefined,
    });
  }

  const phoneValid = !needsPhone || phoneSchema.safeParse(phoneDigits(phone)).success;
  const canSubmit =
    voter !== null && phoneValid && (role !== 'recinto_coordinator' || recintoScopes.length > 0);
  const lookupError =
    lookup.isError && (lookup.error instanceof ApiError ? lookup.error.message : text.notFound);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button onClick={() => setOpen(true)}>{messages.admin.usuarios.appoint}</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
        </DialogHeader>

        {!voter ? (
          <form onSubmit={search} className="flex flex-col gap-3" noValidate>
            <label htmlFor={cedulaId} className="text-sm font-medium">
              {text.cedulaLabel}
            </label>
            <div className="flex gap-2">
              <Input
                id={cedulaId}
                value={cedula}
                onChange={(event) => setCedula(formatCedula(event.target.value))}
                inputMode="numeric"
                placeholder={text.cedulaPlaceholder}
                autoFocus
              />
              <Button type="submit" disabled={!isCedula(cedulaDigits(cedula)) || lookup.isPending}>
                {lookup.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {lookup.isPending ? text.searching : text.search}
              </Button>
            </div>
            {lookupError && (
              <p role="alert" className="text-sm text-destructive">
                {lookupError}
              </p>
            )}
          </form>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <p className="text-sm font-medium">{voter.fullName}</p>
            {voter.membership.status !== 'none' && (
              <p className="text-sm text-muted-foreground">{text.alreadyMember}</p>
            )}

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{text.roleLabel}</span>
              <NativeSelect
                value={role}
                onChange={(event) => setRole(event.target.value as AppointableRole)}
              >
                {APPOINTABLE_ROLES.filter(
                  (candidate) => candidate !== 'general_coordinator' || me?.role === 'superadmin',
                ).map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {messages.roles[candidate]}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {role === 'recinto_coordinator' && (
              <div className="flex flex-col gap-2">
                <p id={recintoScopesId} className="text-sm font-medium">
                  {text.recintoScopesLabel}
                </p>
                <RecintoPicker
                  labelledBy={recintoScopesId}
                  value={recintoScopes}
                  onChange={setRecintoScopes}
                />
                <p className="text-sm text-muted-foreground">{text.recintoScopesHint}</p>
              </div>
            )}

            {needsPhone && (
              <>
                <div className="flex flex-col gap-2">
                  <label htmlFor={phoneId} className="text-sm font-medium">
                    {text.phoneLabel}
                  </label>
                  <Input
                    id={phoneId}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    inputMode="numeric"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={phoneWhatsapp}
                    onChange={(event) => setPhoneWhatsapp(event.target.checked)}
                  />
                  {text.phoneWhatsappLabel}
                </label>
              </>
            )}

            {appoint.isError && (
              <p role="alert" className="text-sm text-destructive">
                {appoint.error instanceof ApiError
                  ? appoint.error.message
                  : messages.errors.generic}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVoter(null)}>
                {text.cancel}
              </Button>
              <Button type="submit" disabled={!canSubmit || appoint.isPending}>
                {appoint.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {appoint.isPending ? text.submitting : text.submit}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
