'use client';

import type { Permission } from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * The signed-in user's permissions, from the cached `GET /me` response (plan 4.1). Empty while the
 * session is loading or on error, so callers fail closed rather than briefly showing gated UI.
 */
export function usePermissions(): readonly Permission[] {
  const { data } = useQuery({ queryKey: ['me'], queryFn: api.me });
  return data?.permissions ?? [];
}

/** Whether the signed-in user holds `permission`. */
export function usePermission(permission: Permission): boolean {
  return usePermissions().includes(permission);
}
