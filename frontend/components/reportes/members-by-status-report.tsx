'use client';

import { PERSON_STATUSES, type PersonStatus } from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PeopleResultsTable } from '@/components/reportes/people-results-table';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { api, exportPeopleXlsxUrl } from '@/lib/api';
import { usePermission } from '@/lib/permissions';
import { messages } from '@/messages/es';

const text = messages.reportes.byStatus;

/** `/reportes`'s "members by status" report (plan 8.2): the same `status` filter `/equipo` uses. */
export function MembersByStatusReport() {
  const canExport = usePermission('people.export');
  const [status, setStatus] = useState<PersonStatus | ''>('');
  const [page, setPage] = useState(1);

  const filters = { status: status || undefined };
  const { data, isPending, isError } = useQuery({
    queryKey: ['reportes', 'byStatus', filters, page],
    queryFn: () => api.listPeople({ ...filters, page }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Field label={text.filters.statusLabel}>
          <NativeSelect
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as PersonStatus | '');
              setPage(1);
            }}
          >
            <option value="">{text.filters.statusAll}</option>
            {PERSON_STATUSES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {messages.equipo.status[candidate]}
              </option>
            ))}
          </NativeSelect>
        </Field>
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
