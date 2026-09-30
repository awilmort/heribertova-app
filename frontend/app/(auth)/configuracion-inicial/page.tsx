'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { SetupSuperadminForm } from '@/components/auth/setup-superadmin-form';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.setup;

/**
 * `/configuracion-inicial`: the one-time, unauthenticated page that creates the superadmin (plan
 * 3.3), reachable right after the first deploy — before the URL is shared with anyone — instead of
 * a CLI needing shell access to the server. `GET /api/setup/status` gates it: once a superadmin
 * exists, it never shows the form again, on this visit or any later one.
 */
export default function ConfiguracionInicialPage() {
  const status = useQuery({ queryKey: ['setupStatus'], queryFn: api.setupStatus });

  if (status.isPending) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (status.isError) {
    return <p className="text-center text-muted-foreground">{messages.errors.generic}</p>;
  }

  if (!status.data.needed) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground">{text.alreadyDone}</p>
        <Button asChild>
          <Link href="/login">{text.goToLogin}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{text.title}</h1>
        <p className="text-muted-foreground">{text.intro}</p>
      </div>
      <SetupSuperadminForm />
    </div>
  );
}
