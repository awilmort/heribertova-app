import type { Metadata } from 'next';
import { RespaldosView } from '@/components/admin/respaldos/respaldos-view';
import { RequirePermission } from '@/components/auth/require-permission';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.admin.respaldos.title };

export default function RespaldosAdminPage() {
  return (
    <RequirePermission permission="backups.manage">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{messages.admin.respaldos.title}</h1>
          <p className="text-muted-foreground">{messages.admin.respaldos.intro}</p>
        </div>
        <RespaldosView />
      </div>
    </RequirePermission>
  );
}
