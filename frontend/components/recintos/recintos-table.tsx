'use client';

import type { RecintoCoverageItem } from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AssignCoordinatorsDialog } from '@/components/recintos/assign-coordinators-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, exportRecintosXlsxUrl } from '@/lib/api';
import { usePermission } from '@/lib/permissions';
import { messages } from '@/messages/es';

const text = messages.recintos;

type SortField =
  'sector' | 'name' | 'voterCount' | 'memberCount' | 'share' | 'teamLeaderCount' | 'aspirantCount';

/** Members ÷ voters, 0 for a recinto with no voters (never happens in real data, but keeps this
 * total). */
function shareOf(item: RecintoCoverageItem): number {
  return item.voterCount > 0 ? item.memberCount / item.voterCount : 0;
}

function compare(a: RecintoCoverageItem, b: RecintoCoverageItem, field: SortField): number {
  switch (field) {
    case 'sector':
      return a.sector.localeCompare(b.sector, 'es');
    case 'name':
      return a.name.localeCompare(b.name, 'es');
    case 'voterCount':
      return a.voterCount - b.voterCount;
    case 'memberCount':
      return a.memberCount - b.memberCount;
    case 'share':
      return shareOf(a) - shareOf(b);
    case 'teamLeaderCount':
      return a.teamLeaderCount - b.teamLeaderCount;
    case 'aspirantCount':
      return a.aspirantCount - b.aspirantCount;
  }
}

/**
 * `/recintos` (plan 7.2): the coverage table — voters, members, team leaders, aspirants and current
 * coordinators for every recinto, filterable (search, sector, "sin miembros") and sortable by any
 * column. Default sort is sector then name, which is what gives the "grouped by sector" reading the
 * plan asks for; clicking another column re-sorts the whole (flat, ~110-row) table by it instead.
 */
export function RecintosTable() {
  const canExport = usePermission('reports.view');
  // Read once on mount: a link from `/panel/general`'s sector coverage table (plan 8.1) arrives as
  // `?sector=`, pre-filtering this table without the two pages otherwise needing to know about
  // each other.
  const searchParams = useSearchParams();
  const [q, setQ] = useState('');
  const [sector, setSector] = useState(searchParams.get('sector') ?? '');
  const [withoutMembers, setWithoutMembers] = useState(false);
  const [sortField, setSortField] = useState<SortField>('sector');
  const [sortAsc, setSortAsc] = useState(true);
  const [assigning, setAssigning] = useState<RecintoCoverageItem | null>(null);

  const filters = {
    q: q.trim() || undefined,
    sector: sector || undefined,
    withoutMembers: withoutMembers || undefined,
  };
  const { data, isPending, isError } = useQuery({
    queryKey: ['recintos', filters],
    queryFn: () => api.listRecintos(filters),
  });
  const { data: sectorsData } = useQuery({ queryKey: ['sectors'], queryFn: api.sectors });

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.items].sort((a, b) => {
      const primary = compare(a, b, sortField);
      const signed = sortAsc ? primary : -primary;
      if (signed !== 0) return signed;
      const bySector = a.sector.localeCompare(b.sector, 'es');
      return bySector !== 0 ? bySector : a.name.localeCompare(b.name, 'es');
    });
  }, [data, sortField, sortAsc]);

  function toggleSort(field: SortField) {
    if (field === sortField) {
      setSortAsc((asc) => !asc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label={text.filters.searchLabel}>
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={text.filters.searchPlaceholder}
              className="sm:w-56"
            />
          </Field>
          <Field label={text.filters.sectorLabel}>
            <NativeSelect value={sector} onChange={(event) => setSector(event.target.value)}>
              <option value="">{text.filters.sectorAll}</option>
              {sectorsData?.sectors.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={withoutMembers}
              onChange={(event) => setWithoutMembers(event.target.checked)}
            />
            {text.filters.withoutMembersLabel}
          </label>
        </div>
        {canExport && (
          <Button asChild variant="outline">
            <a href={exportRecintosXlsxUrl} download>
              {text.exportExcel}
            </a>
          </Button>
        )}
      </div>

      {isPending && <p className="text-muted-foreground">{text.loading}</p>}
      {isError && <p className="text-muted-foreground">{messages.errors.generic}</p>}
      {data && sorted.length === 0 && <p className="text-muted-foreground">{text.empty}</p>}

      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <SortTh
                  field="name"
                  label={text.table.recinto}
                  sortField={sortField}
                  sortAsc={sortAsc}
                  toggleSort={toggleSort}
                />
                <SortTh
                  field="sector"
                  label={text.table.sector}
                  sortField={sortField}
                  sortAsc={sortAsc}
                  toggleSort={toggleSort}
                />
                <SortTh
                  field="voterCount"
                  label={text.table.voters}
                  sortField={sortField}
                  sortAsc={sortAsc}
                  toggleSort={toggleSort}
                />
                <SortTh
                  field="memberCount"
                  label={text.table.members}
                  sortField={sortField}
                  sortAsc={sortAsc}
                  toggleSort={toggleSort}
                />
                <SortTh
                  field="share"
                  label={text.table.share}
                  sortField={sortField}
                  sortAsc={sortAsc}
                  toggleSort={toggleSort}
                />
                <SortTh
                  field="teamLeaderCount"
                  label={text.table.teamLeaders}
                  sortField={sortField}
                  sortAsc={sortAsc}
                  toggleSort={toggleSort}
                />
                <SortTh
                  field="aspirantCount"
                  label={text.table.aspirants}
                  sortField={sortField}
                  sortAsc={sortAsc}
                  toggleSort={toggleSort}
                />
                <Th>{text.table.coordinators}</Th>
                <Th>
                  <span className="sr-only">{text.table.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.key} className="border-t">
                  <td className="px-3 py-2">
                    <Link href={`/recintos/${item.key}`} className="hover:underline">
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{item.sector}</td>
                  <td className="px-3 py-2">{item.voterCount}</td>
                  <td className="px-3 py-2">{item.memberCount}</td>
                  <td className="px-3 py-2">{Math.round(shareOf(item) * 100)}%</td>
                  <td className="px-3 py-2">{item.teamLeaderCount}</td>
                  <td className="px-3 py-2">{item.aspirantCount}</td>
                  <td className="px-3 py-2">
                    {item.coordinators.length === 0 ? (
                      <span className="text-muted-foreground">{text.noCoordinators}</span>
                    ) : (
                      item.coordinators.map((coordinator) => coordinator.fullName).join(', ')
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setAssigning(item)}>
                      {text.assign}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assigning && (
        <AssignCoordinatorsDialog
          recinto={assigning}
          onOpenChange={(open) => !open && setAssigning(null)}
        />
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

function SortTh({
  field,
  label,
  sortField,
  sortAsc,
  toggleSort,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortAsc: boolean;
  toggleSort: (field: SortField) => void;
}) {
  const active = field === sortField;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className="flex items-center gap-1"
        aria-pressed={active}
      >
        {label}
        {active && <span aria-hidden>{sortAsc ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
}
