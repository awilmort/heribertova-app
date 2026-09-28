'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActivePath, NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/** The main navigation list, shared by the desktop sidebar and the mobile drawer. */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
