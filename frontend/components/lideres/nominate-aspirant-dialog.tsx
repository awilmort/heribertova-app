'use client';

import {
  cedulaDigits,
  DEFAULT_PROMOTION_SETTINGS,
  formatCedula,
  isCedula,
  phoneDigits,
  phoneSchema,
  type CheckPersonResponse,
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

const text = messages.lideres.nominateDialog;

type Step = 'search' | 'form';

interface InitialMemberDraft {
  key: string;
  cedula: string;
  phone: string;
  phoneWhatsapp: boolean;
  consent: boolean;
}

function emptyDraft(): InitialMemberDraft {
  return { key: crypto.randomUUID(), cedula: '', phone: '', phoneWhatsapp: true, consent: false };
}

function isDraftComplete(draft: InitialMemberDraft): boolean {
  return (
    isCedula(cedulaDigits(draft.cedula)) &&
    phoneSchema.safeParse(phoneDigits(draft.phone)).success &&
    draft.consent
  );
}

export interface NominateAspirantDialogProps {
  /** Pre-fills the cédula and runs the eligibility check as soon as the dialog opens (plan 7.1's
   * "Nominar aspirante" action, which already knows the voter from the recinto listing). */
  initialCedula?: string;
  /** Overrides the trigger button's label; defaults to "Nominar aspirante". */
  triggerLabel?: string;
}

/**
 * "Nominar aspirante" (plan 6.3): cédula → eligibility check (an existing member, or a new person
 * to sponsor) → the initial members that jump-start the new aspirant's team, gated by the stored
 * `nominationMinInitialMembers` setting (plan 6.1) — read from the API rather than hardcoded, per
 * the plan's "the client and server read the same settings". Reuses `POST /api/promotions/nominations`
 * as-is: the backend already enforces every rejection path (team-leader-own-team-only, the
 * open-aspirant limit, scope) this dialog cannot and should not re-implement client-side.
 */
export function NominateAspirantDialog({
  initialCedula,
  triggerLabel,
}: NominateAspirantDialogProps = {}) {
  const queryClient = useQueryClient();
  const cedulaId = useId();
  const phoneId = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('search');
  const [cedula, setCedula] = useState(initialCedula ? formatCedula(initialCedula) : '');
  const [eligibility, setEligibility] = useState<CheckPersonResponse | null>(null);
  const [nomineePhone, setNomineePhone] = useState('');
  const [nomineePhoneWhatsapp, setNomineePhoneWhatsapp] = useState(true);
  const [initialMembers, setInitialMembers] = useState<InitialMemberDraft[]>([
    emptyDraft(),
    emptyDraft(),
  ]);

  const { data: settings } = useQuery({
    queryKey: ['settings', 'promotion'],
    queryFn: api.promotionSettings,
  });
  const minInitialMembers =
    settings?.nominationMinInitialMembers ?? DEFAULT_PROMOTION_SETTINGS.nominationMinInitialMembers;

  const isNew = eligibility?.eligible === true;
  const isExisting = eligibility?.eligible === false && eligibility.code === 'already_registered';

  const check = useMutation({
    mutationFn: api.checkPerson,
    onSuccess: (result) => {
      setEligibility(result);
      if (result.eligible || result.code === 'already_registered') setStep('form');
    },
  });

  const nominate = useMutation({
    mutationFn: () =>
      api.nominate({
        nomineeCedula: cedulaDigits(cedula),
        // Only meaningful (and only required by the server) when nominating a brand-new person:
        // an already-registered nominee keeps their existing contact details untouched.
        nomineePhone: isNew ? phoneDigits(nomineePhone) : undefined,
        nomineePhoneWhatsapp: isNew ? nomineePhoneWhatsapp : undefined,
        initialMembers: initialMembers.filter(isDraftComplete).map((draft) => ({
          cedula: cedulaDigits(draft.cedula),
          nickname: null,
          phone: phoneDigits(draft.phone),
          phoneWhatsapp: draft.phoneWhatsapp,
          phone2: null,
          phone2Whatsapp: null,
          email: null,
          consent: true as const,
        })),
      }),
    onSuccess: async () => {
      toast.success(messages.lideres.success.nominated);
      await queryClient.invalidateQueries({ queryKey: ['leaders'] });
      setOpen(false);
      reset();
    },
  });

  function reset() {
    setStep('search');
    setCedula(initialCedula ? formatCedula(initialCedula) : '');
    setEligibility(null);
    setNomineePhone('');
    setNomineePhoneWhatsapp(true);
    setInitialMembers([emptyDraft(), emptyDraft()]);
    check.reset();
    nominate.reset();
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
    nominate.mutate();
  }

  function updateDraft(key: string, patch: Partial<InitialMemberDraft>) {
    setInitialMembers((drafts) =>
      drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );
  }

  function addDraft() {
    setInitialMembers((drafts) => [...drafts, emptyDraft()]);
  }

  function removeDraft(key: string) {
    setInitialMembers((drafts) => drafts.filter((draft) => draft.key !== key));
  }

  const nomineePhoneValid = !isNew || phoneSchema.safeParse(phoneDigits(nomineePhone)).success;
  const completeCount = initialMembers.filter(isDraftComplete).length;
  const remaining = Math.max(0, minInitialMembers - completeCount);
  const canSubmit = nomineePhoneValid && remaining === 0;
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
      <Button onClick={openDialog}>{triggerLabel ?? messages.lideres.nominate}</Button>
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
                {eligibility.code === 'not_a_voter' ? text.notFound : text.notEligible}
              </p>
            )}
            {checkError && (
              <p role="alert" className="text-sm text-destructive">
                {checkError}
              </p>
            )}
          </form>
        )}

        {step === 'form' && eligibility && (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            {isExisting && <p className="text-sm text-muted-foreground">{text.alreadyMember}</p>}

            {isNew && eligibility.eligible && (
              <>
                <p className="text-sm font-medium">{eligibility.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {text.newNominee(eligibility.fullName)}
                </p>

                <div className="flex flex-col gap-2">
                  <label htmlFor={phoneId} className="text-sm font-medium">
                    {text.phoneLabel}
                  </label>
                  <Input
                    id={phoneId}
                    value={nomineePhone}
                    onChange={(event) => setNomineePhone(event.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={nomineePhoneWhatsapp}
                    onChange={(event) => setNomineePhoneWhatsapp(event.target.checked)}
                  />
                  {text.phoneWhatsappLabel}
                </label>
              </>
            )}

            <div className="flex flex-col gap-3 border-t pt-4">
              <p className="text-sm font-medium">{text.initialMembersTitle}</p>
              {initialMembers.map((draft, index) => (
                <div key={draft.key} className="flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => removeDraft(draft.key)}
                    >
                      {text.removeMember}
                    </Button>
                  </div>
                  <Input
                    aria-label={text.memberCedulaLabel}
                    placeholder={text.memberCedulaLabel}
                    value={draft.cedula}
                    onChange={(event) =>
                      updateDraft(draft.key, { cedula: formatCedula(event.target.value) })
                    }
                    inputMode="numeric"
                  />
                  <Input
                    aria-label={text.memberPhoneLabel}
                    placeholder={text.memberPhoneLabel}
                    value={draft.phone}
                    onChange={(event) => updateDraft(draft.key, { phone: event.target.value })}
                    inputMode="numeric"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.phoneWhatsapp}
                      onChange={(event) =>
                        updateDraft(draft.key, { phoneWhatsapp: event.target.checked })
                      }
                    />
                    {text.memberWhatsappLabel}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.consent}
                      onChange={(event) =>
                        updateDraft(draft.key, { consent: event.target.checked })
                      }
                    />
                    {text.memberConsentLabel}
                  </label>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addDraft}>
                {text.addMember}
              </Button>
              <p className="text-sm text-muted-foreground">{text.initialMembersHint(remaining)}</p>
            </div>

            {nominate.isError && (
              <p role="alert" className="text-sm text-destructive">
                {nominate.error instanceof ApiError
                  ? nominate.error.message
                  : messages.errors.generic}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStep('search')}>
                {text.back}
              </Button>
              <Button type="submit" disabled={!canSubmit || nominate.isPending}>
                {nominate.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {nominate.isPending ? text.submitting : text.submit}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
