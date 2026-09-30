'use client';

import { cedulaDigits, formatCedula, isCedula } from '@heribertova/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.auth;

/** Only a same-site path is a safe redirect target; anything else (an absolute URL) is ignored. */
function safeNextPath(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/inicio';
}

/**
 * The login form (plan 3.4): cédula + password, then, for the superadmin only, a second step for
 * the TOTP code. `POST /api/auth/login` answers 204 (session opened) or 202 (`totpRequired`); the
 * step this component is on is purely local UI state, since the actual authorization lives in the
 * `__Host-totp` cookie the server already set.
 */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const cedulaId = useId();
  const passwordId = useId();
  const codeId = useId();

  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [cedula, setCedula] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  function goToNext() {
    router.push(safeNextPath(next));
  }

  const login = useMutation({
    mutationFn: api.login,
    onSuccess: (result) => {
      if (result.totpRequired) setStep('totp');
      else goToNext();
    },
  });

  const verify = useMutation({
    mutationFn: api.verifyTotp,
    onSuccess: goToNext,
    onError: (error) => {
      setCode('');
      // A challenge that expired or was otherwise lost cannot be retried; only a fresh login can.
      if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
        setStep('credentials');
        setPassword('');
      }
    },
  });

  const digits = cedulaDigits(cedula);
  const credentialsComplete = isCedula(digits) && password.length > 0;

  function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (credentialsComplete) {
      login.mutate({ cedula: digits, password });
    }
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length === 6) verify.mutate({ code });
  }

  if (step === 'totp') {
    return (
      <form onSubmit={submitCode} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium">{text.totp.title}</h2>
          <p className="text-sm text-muted-foreground">{text.totp.subtitle}</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={codeId} className="text-sm font-medium">
            {text.totp.codeLabel}
          </label>
          <Input
            id={codeId}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            className="h-11 text-lg tracking-widest"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-11"
          disabled={code.length !== 6 || verify.isPending}
        >
          {verify.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {verify.isPending ? text.totp.verifying : text.totp.verify}
        </Button>
        <div aria-live="polite">{verify.isError && <FormError error={verify.error} />}</div>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor={cedulaId} className="text-sm font-medium">
          {text.login.cedulaLabel}
        </label>
        <Input
          id={cedulaId}
          value={cedula}
          onChange={(event) => setCedula(formatCedula(event.target.value))}
          inputMode="numeric"
          autoComplete="username"
          placeholder={text.login.cedulaPlaceholder}
          className="h-11 text-lg tracking-wide"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={passwordId} className="text-sm font-medium">
          {text.login.passwordLabel}
        </label>
        <PasswordInput
          id={passwordId}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          className="h-11"
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="h-11"
        disabled={!credentialsComplete || login.isPending}
      >
        {login.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {login.isPending ? text.login.submitting : text.login.submit}
      </Button>
      <div aria-live="polite">{login.isError && <FormError error={login.error} />}</div>
      <p className="text-center text-sm text-muted-foreground">{text.login.forgotPassword}</p>
    </form>
  );
}

function FormError({ error }: { error: Error }) {
  const message = error instanceof ApiError ? error.message : messages.errors.generic;
  return (
    <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      {message}
    </p>
  );
}
