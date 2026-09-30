import type { Permission } from '@heribertova/shared';
import {
  Building2,
  Contact2,
  Crown,
  DatabaseBackup,
  FileBarChart,
  FileClock,
  Home,
  MapPin,
  Search,
  Settings,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { messages } from '@/messages/es';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hidden from the nav unless the signed-in user holds this permission. Omit for every role. */
  permission?: Permission;
}

/** Main navigation. Each phase adds the entry for the page it ships. `<NavLinks>` filters this list
 * by the user's permissions (plan 4.2). */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/inicio', label: messages.nav.home, icon: Home },
  { href: '/padron', label: messages.nav.padron, icon: Search, permission: 'voters.lookup' },
  { href: '/equipo', label: messages.nav.equipo, icon: Contact2, permission: 'people.create' },
  { href: '/lideres', label: messages.nav.lideres, icon: Crown, permission: 'leaders.nominate' },
  {
    href: '/mi-recinto',
    label: messages.nav.miRecinto,
    icon: MapPin,
    permission: 'recintos.viewOwn',
  },
  {
    href: '/recintos',
    label: messages.nav.recintos,
    icon: Building2,
    permission: 'recintos.assignCoordinator',
  },
  {
    href: '/reportes',
    label: messages.nav.reportes,
    icon: FileBarChart,
    permission: 'reports.view',
  },
  {
    href: '/admin/usuarios',
    label: messages.nav.usuarios,
    icon: Users,
    permission: 'users.manage',
  },
  {
    href: '/admin/auditoria',
    label: messages.nav.auditoria,
    icon: FileClock,
    permission: 'audit.view',
  },
  {
    href: '/admin/padron',
    label: messages.nav.padronAdmin,
    icon: Upload,
    permission: 'voters.import',
  },
  {
    href: '/admin/respaldos',
    label: messages.nav.respaldos,
    icon: DatabaseBackup,
    permission: 'backups.manage',
  },
  {
    href: '/admin/configuracion',
    label: messages.nav.configuracion,
    icon: Settings,
    permission: 'settings.manage',
  },
];

/** A nav item is active on its own page and on any page nested under it. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
