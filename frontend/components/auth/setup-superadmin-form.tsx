'use client';

import {
  cedulaDigits,
  formatCedula,
  isCedula,
  phoneDigits,
  phoneSchema,
  SUPERADMIN_PASSWORD_MIN_LENGTH,
} from '@heribertova/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.setup;

function fieldError(error: Error | null, field: string): string | null {
  if (!(error instanceof ApiError)) return null;
  return error.fields?.[`body.${field}`]?.[0] ?? null;
}

/**
 * `/configuracion-inicial`: creates the superadmin from details typed here instead of a CLI
 * wizard (plan 3.3). Works only once — `SetupGate` (the page) already confirmed setup is still
 * open before rendering this.
 */
export function SetupSuperadminForm() {
  const router = useRouter();
  const cedulaId = useId();
  const fullNameId = useId();
  const birthDateId = useId();
  const phoneId = useId();
  const recintoNameId = useId();
  const sectorId = useId();
  const passwordId = useId();
  const passwordConfirmId = useId();

  const [cedula, setCedula] = useState('');
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneWhatsapp, setPhoneWhatsapp] = useState(true);
  const [recintoName, setRecintoName] = useState('');
  const [sector, setSector] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const create = useMutation({
    mutationFn: api.setupSuperadmin,
    onSuccess: () => {
      toast.success(text.success);
      router.push('/login');
    },
  });

  const digits = cedulaDigits(cedula);
  const phoneDigitsValue = phoneDigits(phone);
  const passwordsMatch = password.length > 0 && password === passwordConfirm;
  const complete =
    isCedula(digits) &&
    fullName.trim().length > 0 &&
    birthDate.length > 0 &&
    phoneSchema.safeParse(phoneDigitsValue).success &&
    recintoName.trim().length > 0 &&
    sector.trim().length > 0 &&
    password.length >= SUPERADMIN_PASSWORD_MIN_LENGTH &&
    passwordsMatch;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete) return;
    create.mutate({
      cedula: digits,
      fullName: fullName.trim(),
      birthDate,
      phone: phoneDigitsValue,
      phoneWhatsapp,
      recintoName: recintoName.trim(),
      sector: sector.trim(),
      password,
    });
  }

  const generalError =
    create.isError && !(create.error instanceof ApiError && create.error.fields)
      ? create.error instanceof ApiError
        ? create.error.message
        : messages.errors.generic
      : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor={cedulaId} className="text-sm font-medium">
          {text.fields.cedula}
        </label>
        <Input
          id={cedulaId}
          value={cedula}
          onChange={(event) => setCedula(formatCedula(event.target.value))}
          inputMode="numeric"
          aria-invalid={fieldError(create.error, 'cedula') ? true : undefined}
        />
        {fieldError(create.error, 'cedula') && (
          <p role="alert" className="text-sm text-destructive">
            {fieldError(create.error, 'cedula')}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={fullNameId} className="text-sm font-medium">
          {text.fields.fullName}
        </label>
        <Input id={fullNameId} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={birthDateId} className="text-sm font-medium">
          {text.fields.birthDate}
        </label>
        <Input
          id={birthDateId}
          type="date"
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={phoneId} className="text-sm font-medium">
          {text.fields.phone}
        </label>
        <Input
          id={phoneId}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          inputMode="numeric"
          aria-invalid={fieldError(create.error, 'phone') ? true : undefined}
        />
        {fieldError(create.error, 'phone') && (
          <p role="alert" className="text-sm text-destructive">
            {fieldError(create.error, 'phone')}
          </p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={phoneWhatsapp}
          onChange={(event) => setPhoneWhatsapp(event.target.checked)}
        />
        {text.fields.phoneWhatsapp}
      </label>
      <div className="flex flex-col gap-2">
        <label htmlFor={recintoNameId} className="text-sm font-medium">
          {text.fields.recintoName}
        </label>
        <Input
          id={recintoNameId}
          value={recintoName}
          onChange={(event) => setRecintoName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={sectorId} className="text-sm font-medium">
          {text.fields.sector}
        </label>
        <Input id={sectorId} value={sector} onChange={(event) => setSector(event.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={passwordId} className="text-sm font-medium">
          {text.fields.password}
        </label>
        <PasswordInput
          id={passwordId}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          aria-invalid={fieldError(create.error, 'password') ? true : undefined}
        />
        <p className="text-sm text-muted-foreground">
          {text.passwordHint(SUPERADMIN_PASSWORD_MIN_LENGTH)}
        </p>
        {fieldError(create.error, 'password') && (
          <p role="alert" className="text-sm text-destructive">
            {fieldError(create.error, 'password')}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={passwordConfirmId} className="text-sm font-medium">
          {text.fields.passwordConfirm}
        </label>
        <PasswordInput
          id={passwordConfirmId}
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          autoComplete="new-password"
        />
        {passwordConfirm.length > 0 && !passwordsMatch && (
          <p role="alert" className="text-sm text-destructive">
            {text.passwordMismatch}
          </p>
        )}
      </div>
      {generalError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          {generalError}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="h-11"
        disabled={!complete || create.isPending}
      >
        {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {create.isPending ? text.submitting : text.submit}
      </Button>
    </form>
  );
}
