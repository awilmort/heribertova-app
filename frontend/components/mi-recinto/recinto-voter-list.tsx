'use client';

import type { RecintoVoterFilter, RecintoVoterItem } from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { VoterDetailDrawer } from '@/components/mi-recinto/voter-detail-drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { MembershipBadge } from '@/components/voters/membership-badge';
import { api } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.miRecinto;

/** The voter list for `/mi-recinto` (plan 7.1): searchable by name prefix (server-side, accent-
 * insensitive), filterable to non-members and/or one colegio, paginated. A row opens the detail
 * drawer, which hosts the "Registrar como miembro" / "Nominar aspirante" actions. */
export function RecintoVoterList({
  recintoKey,
  colegios,
}: {
  recintoKey: string;
  colegios: readonly { id: number; voterCount: number }[];
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<RecintoVoterFilter>('all');
  const [colegio, setColegio] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RecintoVoterItem | null>(null);

  const query = { q: q.trim() || undefined, filter, colegio: colegio || undefined, page };
  const { data, isPending, isError } = useQuery({
    queryKey: ['recinto', 'voters', recintoKey, query],
    queryFn: () => api.listRecintoVoters(recintoKey, query),
  });

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <Field label={text.filters.searchLabel}>
          <Input
            value={q}
            onChange={(event) => {
              setPage(1);
              setQ(event.target.value);
            }}
            placeholder={text.filters.searchPlaceholder}
            className="sm:w-56"
          />
        </Field>
        <Field label={text.filters.filterLabel}>
          <NativeSelect
            value={filter}
            onChange={(event) => {
              setPage(1);
              setFilter(event.target.value as RecintoVoterFilter);
            }}
          >
            <option value="all">{text.filters.filterAll}</option>
            <option value="nonMembers">{text.filters.filterNonMembers}</option>
          </NativeSelect>
        </Field>
        {colegios.length > 0 && (
          <Field label={text.filters.colegioLabel}>
            <NativeSelect
              value={colegio}
              onChange={(event) => {
                setPage(1);
                setColegio(event.target.value ? Number(event.target.value) : '');
              }}
            >
              <option value="">{text.filters.colegioAll}</option>
              {colegios.map((item) => (
                <option key={item.id} value={item.id}>
                  {messages.padron.colegio(item.id)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>

      {isPending && <p className="text-muted-foreground">{text.loading}</p>}
      {isError && <p className="text-muted-foreground">{messages.errors.generic}</p>}
      {data && data.items.length === 0 && <p className="text-muted-foreground">{text.empty}</p>}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <Th>{text.table.name}</Th>
                <Th>{text.table.age}</Th>
                <Th>{text.table.colegio}</Th>
                <Th>{text.table.membership}</Th>
                <Th>
                  <span className="sr-only">{text.table.view}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((voter) => (
                <tr key={voter.cedula} className="border-t">
                  <td className="px-3 py-2">{voter.fullName}</td>
                  <td className="px-3 py-2">{voter.age}</td>
                  <td className="px-3 py-2">{messages.padron.colegio(voter.colegioId)}</td>
                  <td className="px-3 py-2">
                    <MembershipBadge membership={voter.membership} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(voter)}>
                      {text.table.view}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {messages.equipo.pagination.previous}
          </Button>
          <p className="text-sm text-muted-foreground">
            {messages.equipo.pagination.pageOf(page, pageCount)}
          </p>
          <Button
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            {messages.equipo.pagination.next}
          </Button>
        </div>
      )}

      {selected && (
        <VoterDetailDrawer voter={selected} onOpenChange={(open) => !open && setSelected(null)} />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}
