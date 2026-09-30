'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { RecintoSummaryCards } from '@/components/mi-recinto/recinto-summary-cards';
import { RecintoVoterList } from '@/components/mi-recinto/recinto-voter-list';
import { api } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.recintos.detail;

/**
 * `/recintos/[key]` (plan 7.2): the same detail a general coordinator or superadmin already gets for
 * their own recinto at `/mi-recinto` — summary cards and the voter list — but for any recinto they
 * click through to from the `/recintos` coverage table, since `assertRecintoInScope` already lets
 * those two roles read any of them.
 */
export function RecintoDetailView({ recintoKey }: { recintoKey: string }) {
  const { data: sectors } = useQuery({ queryKey: ['sectors'], queryFn: api.sectors });
  const colegios =
    sectors?.sectors
      .flatMap((sector) => sector.recintos)
      .find((recinto) => recinto.key === recintoKey)?.colegios ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/recintos" className="text-sm text-muted-foreground hover:underline">
        {text.back}
      </Link>
      <RecintoSummaryCards recintoKey={recintoKey} />
      <RecintoVoterList recintoKey={recintoKey} colegios={colegios} />
    </div>
  );
}
