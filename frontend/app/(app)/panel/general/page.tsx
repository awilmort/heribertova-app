import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/require-permission';
import { GeneralDashboard } from '@/components/panel/general-dashboard';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.panelGeneral.title };

export default function PanelGeneralPage() {
  return (
    <RequirePermission permission="dashboards.general">
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">{messages.panelGeneral.title}</h1>
        <GeneralDashboard />
      </div>
    </RequirePermission>
  );
}
