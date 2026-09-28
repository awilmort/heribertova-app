'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';
import { LogoHorizontal } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { messages } from '@/messages/es';
import { NavLinks } from './nav-links';

/** Hamburger button + slide-in drawer with the navigation, shown below the lg breakpoint. */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          className="lg:hidden"
          aria-label={messages.nav.openMenu}
        >
          <Menu className="size-6" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-card p-4">
        <SheetHeader className="p-0">
          <LogoHorizontal className="h-auto w-44" />
          <SheetTitle className="sr-only">{messages.nav.menuTitle}</SheetTitle>
          <SheetDescription className="sr-only">{messages.nav.main}</SheetDescription>
        </SheetHeader>
        <nav aria-label={messages.nav.main} className="mt-4">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
