import type { Metadata } from 'next';
import { AuditLogView } from '@/components/auditoria/audit-log-view';
import { RequirePermission } from '@/components/auth/require-permission';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.admin.auditoria.title };

export default function AuditoriaPage() {
  return (
    <RequirePermission permission="audit.view">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{messages.admin.auditoria.title}</h1>
          <p className="text-muted-foreground">{messages.admin.auditoria.intro}</p>
        </div>
        <AuditLogView />
      </div>
    </RequirePermission>
  );
}
