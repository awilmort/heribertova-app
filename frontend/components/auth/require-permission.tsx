'use client';

import type { Permission } from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { api } from '@/lib/api';

/**
 * Gates an admin page behind `permission` (plan 4.3): while `/me` is pending it shows a spinner,
 * and once it resolves without the permission it redirects to `/acceso-denegado`. The nav already
 * hides links a role cannot use (plan 4.2), but this covers a direct visit to the URL, which the
 * server itself would also refuse (HERIBERTO_ARCHITECTURE.md §6.3: "the UI only hides what the
 * server would refuse anyway").
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const router = useRouter();
  const { data, isPending } = useQuery({ queryKey: ['me'], queryFn: api.me });
  const allowed = data?.permissions.includes(permission) ?? false;

  useEffect(() => {
    if (!isPending && !allowed) router.replace('/acceso-denegado');
  }, [isPending, allowed, router]);

  if (isPending || !allowed) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return <>{children}</>;
}
