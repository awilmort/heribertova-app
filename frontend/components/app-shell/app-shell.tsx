import type { ReactNode } from 'react';
import { LogoHorizontal, LogoMark } from '@/components/brand/logo';
import { messages } from '@/messages/es';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';
import { UserMenu } from './user-menu';

/**
 * Authenticated layout: fixed sidebar on desktop (lg+), top bar with a drawer on phones.
 * Designed mobile-first at 360px wide.
 */
export function AppShell({ userName, children }: { userName: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside
        data-testid="sidebar"
        className="hidden border-r bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6 lg:p-4"
      >
        <LogoHorizontal className="h-auto w-48" priority />
        <nav aria-label={messages.nav.main}>
          <NavLinks />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-2 border-b bg-background/95 px-2 backdrop-blur sm:px-4">
          <MobileNav />
          <LogoMark size={32} className="lg:hidden" />
          <span className="font-semibold lg:hidden">{messages.app.name}</span>
          <div className="ml-auto">
            <UserMenu name={userName} />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
