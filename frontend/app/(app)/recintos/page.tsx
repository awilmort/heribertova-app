import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RequirePermission } from '@/components/auth/require-permission';
import { RecintosTable } from '@/components/recintos/recintos-table';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.recintos.title };

export default function RecintosPage() {
  return (
    <RequirePermission permission="recintos.assignCoordinator">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{messages.recintos.title}</h1>
          <p className="text-muted-foreground">{messages.recintos.intro}</p>
        </div>
        {/* RecintosTable reads `?sector=` via useSearchParams (plan 8.1's dashboard link), which
            Next requires a Suspense boundary for. */}
        <Suspense>
          <RecintosTable />
        </Suspense>
      </div>
    </RequirePermission>
  );
}
