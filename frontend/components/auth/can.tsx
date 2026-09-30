'use client';

import type { Permission } from '@heribertova/shared';
import type { ReactNode } from 'react';
import { usePermission } from '@/lib/permissions';

/** Renders `children` only when the signed-in user holds `permission` (plan 4.1's `ROLE_PERMISSIONS`). */
export function Can({ permission, children }: { permission: Permission; children: ReactNode }) {
  return usePermission(permission) ? <>{children}</> : null;
}
