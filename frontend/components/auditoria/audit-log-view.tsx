'use client';

import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  type AuditAction,
  type AuditEntity,
} from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { api } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.admin.auditoria;

/** "15/6/2026, 3:04 p. m." in the browser's own timezone; the API sends UTC ISO strings. */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-DO');
}

/** `/admin/auditoria` (plan 4.3): the audit trail, filterable by action, entity and day range, with
 * simple next/previous pagination (the trail is append-only, so a page never changes under the
 * user, unlike `/equipo`'s lists). */
export function AuditLogView() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<AuditAction | ''>('');
  const [entity, setEntity] = useState<AuditEntity | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filters = {
    page,
    action: action || undefined,
    entity: entity || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const { data, isPending, isError } = useQuery({
    queryKey: ['audit', filters],
    queryFn: () => api.listAudit(filters),
  });

  function updateFilter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setPage(1);
      setter(value);
    };
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <Field label={text.filters.actionLabel}>
          <NativeSelect
            value={action}
            onChange={(event) => updateFilter(setAction)(event.target.value as AuditAction | '')}
          >
            <option value="">{text.filters.actionAll}</option>
            {AUDIT_ACTIONS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {text.actions[candidate]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={text.filters.entityLabel}>
          <NativeSelect
            value={entity}
            onChange={(event) => updateFilter(setEntity)(event.target.value as AuditEntity | '')}
          >
            <option value="">{text.filters.entityAll}</option>
            {AUDIT_ENTITIES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {text.entities[candidate]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={text.filters.fromLabel}>
          <Input
            type="date"
            value={from}
            onChange={(event) => updateFilter(setFrom)(event.target.value)}
          />
        </Field>
        <Field label={text.filters.toLabel}>
          <Input
            type="date"
            value={to}
            onChange={(event) => updateFilter(setTo)(event.target.value)}
          />
        </Field>
      </div>

      {isPending && <p className="text-muted-foreground">{text.loading}</p>}
      {isError && <p className="text-muted-foreground">{messages.errors.generic}</p>}
      {data && data.items.length === 0 && <p className="text-muted-foreground">{text.empty}</p>}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <Th>{text.table.at}</Th>
                <Th>{text.table.actor}</Th>
                <Th>{text.table.action}</Th>
                <Th>{text.table.summary}</Th>
                <Th>{text.table.ip}</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((entry) => (
                <tr key={entry.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(entry.at)}</td>
                  <td className="px-3 py-2">{entry.actorUsername}</td>
                  <td className="px-3 py-2">{text.actions[entry.action]}</td>
                  <td className="px-3 py-2">{entry.summary}</td>
                  <td className="px-3 py-2">{entry.ip ?? '—'}</td>
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
