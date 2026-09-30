import type { Metadata } from 'next';
import { ConfiguracionView } from '@/components/admin/configuracion/configuracion-view';
import { RequirePermission } from '@/components/auth/require-permission';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.admin.configuracion.title };

export default function ConfiguracionAdminPage() {
  return (
    <RequirePermission permission="settings.manage">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{messages.admin.configuracion.title}</h1>
          <p className="text-muted-foreground">{messages.admin.configuracion.intro}</p>
        </div>
        <ConfiguracionView />
      </div>
    </RequirePermission>
  );
}
