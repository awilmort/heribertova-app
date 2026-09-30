'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { PromotionCelebrationDialog } from '@/components/app-shell/promotion-celebration-dialog';
import { DefaultPasswordBanner } from '@/components/auth/default-password-banner';
import { PasswordChangeDialog } from '@/components/auth/password-change-dialog';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { messages } from '@/messages/es';

/**
 * Wraps every `(app)` page (plan 3.4): loads the session (`GET /me`) and renders the shell once it
 * resolves. `proxy.ts` only checked that a session cookie exists, not that it is still valid, so a
 * 401 here means it expired or was revoked mid-session: this redirects to /login, same as the coarse
 * gate would have if the cookie had already been gone.
 */
export function AuthenticatedShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    retry: false,
  });
  const isUnauthenticated = isError && error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (isUnauthenticated) router.push('/login');
  }, [isUnauthenticated, router]);

  if (isPending || isUnauthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-muted-foreground">{messages.errors.generic}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          {messages.errors.retry}
        </Button>
      </div>
    );
  }

  return (
    <>
      <PasswordChangeDialog usingDefaultPassword={data.usingDefaultPassword} />
      <PromotionCelebrationDialog permissionsStale={data.permissionsStale} role={data.role} />
      <AppShell userName={data.person.nickname ?? data.person.fullName}>
        {data.usingDefaultPassword && <DefaultPasswordBanner />}
        {children}
      </AppShell>
    </>
  );
}
