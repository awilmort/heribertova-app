import { Home, Search, type LucideIcon } from 'lucide-react';
import { messages } from '@/messages/es';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Main navigation. Each phase adds the entry for the page it ships; Phase 4.2 filters this list
 * by the user's permissions.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/inicio', label: messages.nav.home, icon: Home },
  { href: '/padron', label: messages.nav.padron, icon: Search },
];

/** A nav item is active on its own page and on any page nested under it. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
