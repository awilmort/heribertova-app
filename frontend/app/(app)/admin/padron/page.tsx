import type { Metadata } from 'next';
import { ImportPadronView } from '@/components/admin/padron/import-padron-view';
import { RequirePermission } from '@/components/auth/require-permission';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.admin.padron.title };

export default function PadronAdminPage() {
  return (
    <RequirePermission permission="voters.import">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{messages.admin.padron.title}</h1>
          <p className="text-muted-foreground">{messages.admin.padron.intro}</p>
        </div>
        <ImportPadronView />
      </div>
    </RequirePermission>
  );
}
