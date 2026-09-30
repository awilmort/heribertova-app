import type { Metadata } from 'next';
import { LeaderDashboard } from '@/components/panel/leader-dashboard';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.panel.title };

export default function PanelPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{messages.panel.title}</h1>
      <LeaderDashboard />
    </div>
  );
}
