'use client';

import {
  cedulaDigits,
  formatCedula,
  hasValidCheckDigit,
  isCedula,
  type VoterCard,
} from '@heribertova/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MembershipBadge } from '@/components/voters/membership-badge';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.padron;

/**
 * Consulta de Padrón (plan 2.2): a cédula input with the display mask, and the voter's card.
 * A lookup is an explicit action (a mutation, not a cached query) because the server audits each
 * one and counts it toward the user's daily quota: nothing should repeat it behind the user's back.
 */
export function VoterLookup() {
  const inputId = useId();
  const hintId = useId();
  const [cedula, setCedula] = useState('');
  const lookup = useMutation({ mutationFn: api.lookupVoter });

  const digits = cedulaDigits(cedula);
  const complete = isCedula(digits);
  const suspicious = complete && !hasValidCheckDigit(digits);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (complete) lookup.mutate(digits);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
        <label htmlFor={inputId} className="text-sm font-medium">
          {text.cedulaLabel}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={inputId}
            value={cedula}
            onChange={(event) => {
              setCedula(formatCedula(event.target.value));
            }}
            inputMode="numeric"
            autoComplete="off"
            placeholder={text.cedulaPlaceholder}
            aria-describedby={hintId}
            className="h-11 text-lg tracking-wide sm:max-w-xs"
          />
          <Button type="submit" size="lg" className="h-11" disabled={!complete || lookup.isPending}>
            {lookup.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {lookup.isPending ? text.searching : text.submit}
          </Button>
        </div>
        <p id={hintId} className="text-sm text-muted-foreground">
          {suspicious ? text.checkDigitWarning : text.quotaNote}
        </p>
      </form>

      <div aria-live="polite">
        {lookup.isError && <LookupError error={lookup.error} />}
        {lookup.isSuccess && <VoterResult voter={lookup.data} />}
      </div>
    </div>
  );
}

/** Not found and quota messages come from the API, in Spanish; anything else is generic. */
function LookupError({ error }: { error: Error }) {
  const message = error instanceof ApiError ? error.message : messages.errors.generic;
  return (
    <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      {message}
    </p>
  );
}

function VoterResult({ voter }: { voter: VoterCard }) {
  const rows: [string, string][] = [
    [text.fields.cedula, formatCedula(voter.cedula)],
    [text.fields.age, text.years(voter.age)],
    [text.fields.birthday, text.birthday(voter.birthDay, voter.birthMonth)],
    [text.fields.sector, voter.sector],
    [text.fields.recinto, voter.recintoName],
    [text.fields.colegio, text.colegio(voter.colegioId)],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg">{voter.fullName}</h2>
        </CardTitle>
        <MembershipBadge membership={voter.membership} />
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
          {voter.membership.status === 'member' && voter.membership.leaderName && (
            <Row label={text.fields.leader} value={voter.membership.leaderName} />
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}
