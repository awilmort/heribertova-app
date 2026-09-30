import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/require-permission';
import { MiRecintoView } from '@/components/mi-recinto/mi-recinto-view';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.miRecinto.title };

export default function MiRecintoPage() {
  return (
    <RequirePermission permission="recintos.viewOwn">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{messages.miRecinto.title}</h1>
          <p className="text-muted-foreground">{messages.miRecinto.intro}</p>
        </div>
        <MiRecintoView />
      </div>
    </RequirePermission>
  );
}
