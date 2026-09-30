'use client';

import {
  cedulaDigits,
  formatCedula,
  isCedula,
  phoneDigits,
  phoneSchema,
  type CheckPersonResponse,
  type PersonDetail,
} from '@heribertova/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PhotoSlot } from '@/components/equipo/photo-slot';
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

const text = messages.equipo.newMemberDialog;

type Step = 'search' | 'form' | 'photos';

export interface NewPersonDialogProps {
  /** Pre-fills the cédula and runs the eligibility check as soon as the dialog opens (plan 7.1's
   * "Registrar como miembro" action, which already knows the voter from the recinto listing). */
  initialCedula?: string;
  /** Overrides the trigger button's label; defaults to "Nuevo miembro" (`/equipo`'s own wording). */
  triggerLabel?: string;
}

/**
 * "Nuevo miembro" (plan 5.3): cédula → eligibility check → contact form → photos. The save happens
 * in two steps (HERIBERTO_ARCHITECTURE.md §6): `register` creates the record, then the photo step
 * uploads to that already-existing person. A fixed `Idempotency-Key` for the dialog's lifetime means
 * retrying a failed `register` (a dropped connection) reuses the same record instead of creating a
 * duplicate; once past that step, every photo retry targets that one person's id, so a failed photo
 * upload can never duplicate the member either.
 */
export function NewPersonDialog({ initialCedula, triggerLabel }: NewPersonDialogProps = {}) {
  const queryClient = useQueryClient();
  const cedulaId = useId();
  const nicknameId = useId();
  const phoneId = useId();
  const phone2Id = useId();
  const emailId = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('search');
  const [cedula, setCedula] = useState(initialCedula ? formatCedula(initialCedula) : '');
  const [eligibility, setEligibility] = useState<CheckPersonResponse | null>(null);
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneWhatsapp, setPhoneWhatsapp] = useState(true);
  const [phone2, setPhone2] = useState('');
  const [phone2Whatsapp, setPhone2Whatsapp] = useState(true);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [created, setCreated] = useState<PersonDetail | null>(null);
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const check = useMutation({
    mutationFn: api.checkPerson,
    onSuccess: (result) => {
      setEligibility(result);
      if (result.eligible) setStep('form');
    },
  });

  const register = useMutation({
    mutationFn: () => {
      if (!eligibility?.eligible) throw new Error('register called before an eligible check');
      return api.registerPerson(
        {
          cedula: cedulaDigits(cedula),
          nickname: nickname.trim() || null,
          phone: phoneDigits(phone),
          phoneWhatsapp,
          phone2: phone2.trim() ? phoneDigits(phone2) : null,
          phone2Whatsapp: phone2.trim() ? phone2Whatsapp : null,
          email: email.trim() || null,
          consent: true,
          leaderId: null,
        },
        idempotencyKeyRef.current,
      );
    },
    onSuccess: async (person) => {
      toast.success(messages.equipo.success.registered);
      setCreated(person);
      setStep('photos');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['people'] }),
        // This registration may have just crossed the caller's own promotion threshold (plan 6.1):
        // refetching `/me` picks up the new role/permissions and the celebration (plan 6.2).
        queryClient.invalidateQueries({ queryKey: ['me'] }),
      ]);
    },
  });

  function reset() {
    setStep('search');
    setCedula(initialCedula ? formatCedula(initialCedula) : '');
    setEligibility(null);
    setNickname('');
    setPhone('');
    setPhoneWhatsapp(true);
    setPhone2('');
    setPhone2Whatsapp(true);
    setEmail('');
    setConsent(false);
    setCreated(null);
    idempotencyKeyRef.current = crypto.randomUUID();
    check.reset();
    register.reset();
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = cedulaDigits(cedula);
    if (isCedula(digits)) check.mutate(digits);
  }

  function openDialog() {
    setOpen(true);
    if (initialCedula) check.mutate(cedulaDigits(initialCedula));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    register.mutate();
  }

  const phoneValid = phoneSchema.safeParse(phoneDigits(phone)).success;
  const phone2Valid = phone2.trim() === '' || phoneSchema.safeParse(phoneDigits(phone2)).success;
  const canSubmit = phoneValid && phone2Valid && consent;
  const checkError =
    check.isError &&
    (check.error instanceof ApiError ? check.error.message : messages.errors.generic);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button onClick={openDialog}>{triggerLabel ?? messages.equipo.newMember}</Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
        </DialogHeader>

        {step === 'search' && (
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
              <Button type="submit" disabled={!isCedula(cedulaDigits(cedula)) || check.isPending}>
                {check.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {check.isPending ? text.searching : text.search}
              </Button>
            </div>
            {eligibility && !eligibility.eligible && (
              <p role="alert" className="text-sm text-destructive">
                {eligibility.reason}
                {eligibility.code === 'already_registered' &&
                  eligibility.leaderName &&
                  ` ${text.currentLeader(eligibility.leaderName)}`}
              </p>
            )}
            {checkError && (
              <p role="alert" className="text-sm text-destructive">
                {checkError}
              </p>
            )}
          </form>
        )}

        {step === 'form' && eligibility?.eligible && (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div>
              <p className="text-sm font-medium">{eligibility.fullName}</p>
              <p className="text-sm text-muted-foreground">
                {eligibility.recintoName} · {eligibility.sector}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor={nicknameId} className="text-sm font-medium">
                {text.nicknameLabel}
              </label>
              <Input
                id={nicknameId}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor={phoneId} className="text-sm font-medium">
                {text.phoneLabel}
              </label>
              <Input
                id={phoneId}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={phoneWhatsapp}
                onChange={(e) => setPhoneWhatsapp(e.target.checked)}
              />
              {text.phoneWhatsappLabel}
            </label>

            <div className="flex flex-col gap-2">
              <label htmlFor={phone2Id} className="text-sm font-medium">
                {text.phone2Label}
              </label>
              <Input
                id={phone2Id}
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
                inputMode="numeric"
              />
            </div>
            {phone2.trim() !== '' && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={phone2Whatsapp}
                  onChange={(e) => setPhone2Whatsapp(e.target.checked)}
                />
                {text.phone2WhatsappLabel}
              </label>
            )}

            <div className="flex flex-col gap-2">
              <label htmlFor={emailId} className="text-sm font-medium">
                {text.emailLabel}
              </label>
              <Input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              {text.consentLabel}
            </label>

            {register.isError && (
              <p role="alert" className="text-sm text-destructive">
                {register.error instanceof ApiError
                  ? register.error.message
                  : messages.errors.generic}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep('search')}>
                {text.back}
              </Button>
              <Button type="submit" disabled={!canSubmit || register.isPending}>
                {register.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {register.isPending ? text.saving : text.save}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 'photos' && created && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{text.savedNote}</p>
            <PhotoSlot
              personId={created.id}
              kind="cedula"
              hasPhoto={created.photos.cedula}
              onUploaded={setCreated}
            />
            <PhotoSlot
              personId={created.id}
              kind="selfie"
              hasPhoto={created.photos.selfie}
              onUploaded={setCreated}
            />
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                {text.finish}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
