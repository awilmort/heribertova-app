'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { messages } from '@/messages/es';

const text = messages.auth.passwordChange;
/** Once skipped, stays skipped for the rest of the browser session (not every page navigation). */
const DISMISSED_KEY = 'heriberto:passwordChangeDialogDismissed';

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    // Storage unavailable (private mode, etc.): show the dialog again, which is the safe default.
    return false;
  }
}

function markDismissed(): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Nothing to persist; the dialog will simply reappear next time, which is harmless.
  }
}

/**
 * "Le recomendamos cambiar su contraseña" (plan 3.4): shown once per session, right after a login
 * with the default (birth-date) password. Skippable; the persistent banner keeps reminding the
 * user afterwards, until the password actually changes.
 *
 * `AuthenticatedShell` only renders this once `usingDefaultPassword` is known (after `/me`
 * resolves), so its value at first mount is the one that matters: the initial `open` state is
 * derived from it directly, rather than synced in an effect.
 */
export function PasswordChangeDialog({ usingDefaultPassword }: { usingDefaultPassword: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(() => usingDefaultPassword && !wasDismissed());

  function skip() {
    markDismissed();
    setOpen(false);
  }

  function changeNow() {
    markDismissed();
    setOpen(false);
    router.push('/perfil');
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : skip())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.dialogTitle}</DialogTitle>
          <DialogDescription>{text.dialogBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={skip}>
            {text.skip}
          </Button>
          <Button onClick={changeNow}>{text.changeNow}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
