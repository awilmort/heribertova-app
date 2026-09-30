'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PeopleResultsTable } from '@/components/reportes/people-results-table';
import { Button } from '@/components/ui/button';
import { api, exportPeopleXlsxUrl } from '@/lib/api';
import { usePermission } from '@/lib/permissions';
import { messages } from '@/messages/es';

/**
 * `/reportes`'s "members missing photos" report (plan 8.2): specifically the required cédula
 * photo, not `docStatus` — a `docStatus: 'partial'` member might already have it and only be
 * missing the optional selfie (`people/service.ts#PersonFilterOptions`).
 */
export function MembersMissingPhotosReport() {
  const canExport = usePermission('people.export');
  const [page, setPage] = useState(1);

  const filters = { missingCedulaPhoto: true as const };
  const { data, isPending, isError } = useQuery({
    queryKey: ['reportes', 'missingPhotos', page],
    queryFn: () => api.listPeople({ ...filters, page }),
  });

  return (
    <div className="flex flex-col gap-4">
      {canExport && (
        <div className="flex justify-end">
          <Button asChild variant="outline">
            <a href={exportPeopleXlsxUrl(filters)} download>
              {messages.reportes.exportExcel}
            </a>
          </Button>
        </div>
      )}
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
