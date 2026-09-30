import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/require-permission';
import { LeadersList } from '@/components/lideres/leaders-list';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.lideres.title };

export default function LideresPage() {
  return (
    <RequirePermission permission="leaders.nominate">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{messages.lideres.title}</h1>
          <p className="text-muted-foreground">{messages.lideres.intro}</p>
        </div>
        <LeadersList />
      </div>
    </RequirePermission>
  );
}
