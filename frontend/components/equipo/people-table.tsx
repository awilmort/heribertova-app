'use client';

import {
  formatCedula,
  PERSON_STATUSES,
  type DocStatus,
  type PersonStatus,
  type PersonSummary,
  type Role,
} from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DeletePersonDialog } from '@/components/equipo/delete-person-dialog';
import { EditPersonDialog } from '@/components/equipo/edit-person-dialog';
import { MemberAvatar } from '@/components/equipo/member-avatar';
import { NewPersonDialog } from '@/components/equipo/new-person-dialog';
import { PhotoUploadDialog } from '@/components/equipo/photo-upload-dialog';
import { ValidatePersonDrawer } from '@/components/equipo/validate-person-drawer';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api, exportPeopleXlsxUrl } from '@/lib/api';
import { usePermission } from '@/lib/permissions';
import { messages } from '@/messages/es';

const text = messages.equipo;

/** `/equipo` (plan 5.3): the caller's own scope (team/subtree/recinto per role, enforced server-side),
 * searchable and paginated, with document badges and the row actions (edit, upload photo, delete). */
/** Roles whose full scope reaches further than their own subtree — the only ones "Mostrar todo"
 * changes anything for. A team leader or aspirant's own subtree already *is* their full scope. */
const ROLES_WITH_BROADER_SCOPE: readonly Role[] = [
  'superadmin',
  'general_coordinator',
  'recinto_coordinator',
];

export function PeopleTable() {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me });
  const canValidate = usePermission('people.validate');
  const canExport = usePermission('people.export');
  const [q, setQ] = useState('');
  const [docStatus, setDocStatus] = useState<DocStatus | ''>('');
  const [status, setStatus] = useState<PersonStatus | ''>('');
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PersonSummary | null>(null);
  const [uploadingFor, setUploadingFor] = useState<PersonSummary | null>(null);
  const [deleting, setDeleting] = useState<PersonSummary | null>(null);
  const [validating, setValidating] = useState<PersonSummary | null>(null);

  const canShowAll = me !== undefined && ROLES_WITH_BROADER_SCOPE.includes(me.role);

  const filters = {
    q: q.trim() || undefined,
    docStatus: docStatus || undefined,
    status: status || undefined,
    scope: canShowAll && showAll ? ('all' as const) : ('own' as const),
    page,
  };
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['people', filters],
    queryFn: () => api.listPeople(filters),
  });

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <Field label={text.filters.searchLabel}>
            <Input
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value);
              }}
              placeholder={text.filters.searchPlaceholder}
              className="sm:w-64"
            />
          </Field>
          <Field label={text.filters.docStatusLabel}>
            <NativeSelect
              value={docStatus}
              onChange={(event) => {
                setPage(1);
                setDocStatus(event.target.value as DocStatus | '');
              }}
            >
              <option value="">{text.filters.docStatusAll}</option>
              <option value="pending">{text.docStatus.pending}</option>
              <option value="partial">{text.docStatus.partial}</option>
              <option value="complete">{text.docStatus.complete}</option>
            </NativeSelect>
          </Field>
          <Field label={text.filters.statusLabel}>
            <NativeSelect
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as PersonStatus | '');
              }}
            >
              <option value="">{text.filters.statusAll}</option>
              {PERSON_STATUSES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {text.status[candidate]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {canShowAll && (
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(event) => {
                  setPage(1);
                  setShowAll(event.target.checked);
                }}
              />
              {text.filters.showAllLabel}
            </label>
          )}
        </div>
        <div className="flex items-end gap-2">
          {canExport && (
            <Button asChild variant="outline">
              <a
                href={exportPeopleXlsxUrl({
                  q: filters.q,
                  status: filters.status,
                  docStatus: filters.docStatus,
                  scope: filters.scope,
                })}
                download
              >
                {text.exportExcel}
              </a>
            </Button>
          )}
          <NewPersonDialog />
        </div>
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
                <Th>{text.table.cedula}</Th>
                <Th>{text.table.recinto}</Th>
                <Th>{text.table.level}</Th>
                <Th>{text.table.status}</Th>
                <Th>{text.table.documents}</Th>
                <Th>
                  <span className="sr-only">{text.table.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((person) => (
                <tr key={person.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <MemberAvatar person={person} />
                      <span>
                        {person.fullName}
                        {person.nickname && (
                          <span className="text-muted-foreground"> · {person.nickname}</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">{formatCedula(person.cedula)}</td>
                  <td className="px-3 py-2">
                    {person.recintoName} · {person.sector}
                    {person.voterInactive && (
                      <div className="mt-1">
                        <Badge tone="warning">{text.badges.voterInactive}</Badge>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{messages.levels[person.level]}</td>
                  <td className="px-3 py-2">
                    {person.status ? text.status[person.status] : text.status.none}
                  </td>
                  <td className="px-3 py-2">
                    <DocStatusBadges person={person} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          {text.table.actions}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(person)}>
                          {text.actions.edit}
                        </DropdownMenuItem>
                        {canValidate && (
                          <DropdownMenuItem onSelect={() => setValidating(person)}>
                            {text.actions.validate}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => setUploadingFor(person)}>
                          {text.actions.uploadPhoto}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleting(person)}
                        >
                          {text.actions.delete}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
            {text.pagination.previous}
          </Button>
          <p className="text-sm text-muted-foreground">{text.pagination.pageOf(page, pageCount)}</p>
          <Button
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            {text.pagination.next}
          </Button>
        </div>
      )}

      {editing && (
        <EditPersonDialog person={editing} onOpenChange={(open) => !open && setEditing(null)} />
      )}
      {uploadingFor && (
        <PhotoUploadDialog
          person={uploadingFor}
          onOpenChange={(open) => !open && setUploadingFor(null)}
          onUploaded={() => void refetch()}
        />
      )}
      {deleting && (
        <DeletePersonDialog person={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
      )}
      {validating && (
        <ValidatePersonDrawer
          person={validating}
          onOpenChange={(open) => !open && setValidating(null)}
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

function DocStatusBadges({ person }: { person: PersonSummary }) {
  if (person.docStatus === 'complete') {
    return <Badge tone="neutral">{text.docStatus.complete}</Badge>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {!person.photos.cedula && <Badge tone="warning">{text.badges.missingCedulaPhoto}</Badge>}
      {!person.photos.selfie && <Badge tone="neutral">{text.badges.missingSelfie}</Badge>}
    </div>
  );
}

function Badge({ tone, children }: { tone: 'neutral' | 'warning'; children: React.ReactNode }) {
  return (
    <span
      className={
        tone === 'warning'
          ? 'rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive'
          : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
      }
    >
      {children}
    </span>
  );
}
