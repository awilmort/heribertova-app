'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '@/lib/api';

/**
 * `/inicio` has no content of its own: it forwards the signed-in user to their role's landing page
 * (`GET /me`'s `landing`, from plan 4.1's `landingFor`), so a bookmark or a link to "home" works
 * for every role without the frontend having to know each role's destination.
 */
export function InicioRedirect() {
  const router = useRouter();
  const { data } = useQuery({ queryKey: ['me'], queryFn: api.me });

  useEffect(() => {
    if (data) router.replace(data.landing);
  }, [data, router]);

  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
    </div>
  );
}
