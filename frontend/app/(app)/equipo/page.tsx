import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/require-permission';
import { PeopleTable } from '@/components/equipo/people-table';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.equipo.title };

export default function EquipoPage() {
  return (
    <RequirePermission permission="people.create">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{messages.equipo.title}</h1>
          <p className="text-muted-foreground">{messages.equipo.intro}</p>
        </div>
        <PeopleTable />
      </div>
    </RequirePermission>
  );
}
