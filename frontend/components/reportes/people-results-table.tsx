'use client';

import { formatCedula, type ListPeopleResponse } from '@heribertova/shared';
import { PersonProfileTrigger } from '@/components/equipo/person-profile-trigger';
import { Button } from '@/components/ui/button';
import { messages } from '@/messages/es';

const text = messages.reportes;

/**
 * The read-only results table shared by `/reportes`'s three member-based reports (plan 8.2): the
 * same row shape `GET /api/people` returns, just without `/equipo`'s row actions (edit, validate,
 * upload, delete) — these are reports, not the management console.
 */
export function PeopleResultsTable({
  data,
  isPending,
  isError,
  page,
  onPageChange,
}: {
  data: ListPeopleResponse | undefined;
  isPending: boolean;
  isError: boolean;
  page: number;
  onPageChange: (page: number) => void;
}) {
  if (isPending || !data) return <p className="text-muted-foreground">{text.loading}</p>;
  if (isError) return <p className="text-muted-foreground">{messages.errors.generic}</p>;
  if (data.items.length === 0) return <p className="text-muted-foreground">{text.empty}</p>;

  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <Th>{text.table.name}</Th>
              <Th>{text.table.cedula}</Th>
              <Th>{text.table.recinto}</Th>
              <Th>{text.table.level}</Th>
              <Th>{text.table.status}</Th>
              <Th>{text.table.documents}</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((person) => (
              <tr key={person.id} className="border-t">
                <td className="px-3 py-2">
                  <PersonProfileTrigger person={person} />
                </td>
                <td className="px-3 py-2">{formatCedula(person.cedula)}</td>
                <td className="px-3 py-2">
                  {person.recintoName} · {person.sector}
                </td>
                <td className="px-3 py-2">{messages.levels[person.level]}</td>
                <td className="px-3 py-2">
                  {person.status
                    ? messages.equipo.status[person.status]
                    : messages.equipo.status.none}
                </td>
                <td className="px-3 py-2">{messages.equipo.docStatus[person.docStatus]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.total > data.pageSize && (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            {text.pagination.previous}
          </Button>
          <p className="text-sm text-muted-foreground">{text.pagination.pageOf(page, pageCount)}</p>
          <Button
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            {text.pagination.next}
          </Button>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}
