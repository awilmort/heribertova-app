import type { ReactNode } from 'react';
import { LogoHorizontal } from '@/components/brand/logo';

/** Public pages (login, password flows): centered card on the beige background. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4">
      <LogoHorizontal className="h-auto w-64 sm:w-80" priority />
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
