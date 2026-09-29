import type { ReactNode } from 'react';
import { AuthenticatedShell } from '@/components/app-shell/authenticated-shell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
