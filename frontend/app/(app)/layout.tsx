import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { messages } from '@/messages/es';

export default function AppLayout({ children }: { children: ReactNode }) {
  // Plan 3.4 replaces the placeholder name with the logged-in user and gates this group behind a session.
  return <AppShell userName={messages.shell.guestName}>{children}</AppShell>;
}
