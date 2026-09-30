'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PeopleResultsTable } from '@/components/reportes/people-results-table';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { api, exportPeopleXlsxUrl } from '@/lib/api';
import { usePermission } from '@/lib/permissions';
import { messages } from '@/messages/es';

const text = messages.reportes.byLocation;

/**
 * `/reportes`'s "members by sector/recinto/colegio" report (plan 8.2): one cascading filter rather
 * than three separate report cards — picking a sector narrows the recinto options to it, and a
 * recinto narrows the colegio options, reusing the same sector → recinto → colegio tree `/recintos`
 * and `/mi-recinto` already fetch (`GET /api/sectors`).
 */
export function MembersByLocationReport() {
  const canExport = usePermission('people.export');
  const [sector, setSector] = useState('');
  const [recintoKey, setRecintoKey] = useState('');
  const [colegioId, setColegioId] = useState('');
  const [page, setPage] = useState(1);

  const { data: sectorsData } = useQuery({ queryKey: ['sectors'], queryFn: api.sectors });
  const recintos = sectorsData?.sectors.find((s) => s.name === sector)?.recintos ?? [];
  const colegios = recintos.find((r) => r.key === recintoKey)?.colegios ?? [];

  const filters = {
    sector: sector || undefined,
    recintoKey: recintoKey || undefined,
    colegioId: colegioId ? Number(colegioId) : undefined,
  };
  const { data, isPending, isError } = useQuery({
    queryKey: ['reportes', 'byLocation', filters, page],
    queryFn: () => api.listPeople({ ...filters, page }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <Field label={text.filters.sectorLabel}>
            <NativeSelect
              value={sector}
              onChange={(event) => {
                setSector(event.target.value);
                setRecintoKey('');
                setColegioId('');
                setPage(1);
              }}
            >
              <option value="">{text.filters.sectorAll}</option>
              {sectorsData?.sectors.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={text.filters.recintoLabel}>
            <NativeSelect
              value={recintoKey}
              disabled={!sector}
              onChange={(event) => {
                setRecintoKey(event.target.value);
                setColegioId('');
                setPage(1);
              }}
            >
              <option value="">{text.filters.recintoAll}</option>
              {recintos.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={text.filters.colegioLabel}>
            <NativeSelect
              value={colegioId}
              disabled={!recintoKey}
              onChange={(event) => {
                setColegioId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{text.filters.colegioAll}</option>
              {colegios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {canExport && (
          <Button asChild variant="outline">
            <a href={exportPeopleXlsxUrl(filters)} download>
              {messages.reportes.exportExcel}
            </a>
          </Button>
        )}
      </div>

      <PeopleResultsTable
        data={data}
        isPending={isPending}
        isError={isError}
        page={page}
        onPageChange={setPage}
      />
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
