'use client';

import { formatCedula, type LeaderLevel } from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { api, exportLeadersXlsxUrl } from '@/lib/api';
import { usePermission } from '@/lib/permissions';
import { messages } from '@/messages/es';

const text = messages.reportes.leadersProgress;
const reportsText = messages.reportes;

/**
 * `/reportes`'s "leaders' progress" report (plan 8.2): the same scoped list `/lideres` shows, as a
 * flat table with each leader's progress toward their goal, exported through a dedicated endpoint
 * (`GET /api/exports/leaders.xlsx`) rather than `exportPeopleXlsxUrl` — the people export has no
 * progress/goal columns.
 */
export function LeadersProgressReport() {
  const canExport = usePermission('reports.view');
  const [level, setLevel] = useState<LeaderLevel | ''>('');

  const filters = { level: level || undefined };
  const { data, isPending, isError } = useQuery({
    queryKey: ['reportes', 'leadersProgress', filters],
    queryFn: () => api.listLeaders(filters),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Field label={text.filters.levelLabel}>
          <NativeSelect
            value={level}
            onChange={(event) => setLevel(event.target.value as LeaderLevel | '')}
          >
            <option value="">{text.filters.levelAll}</option>
            <option value="aspiring_leader">{messages.levels.aspiring_leader}</option>
            <option value="team_leader">{messages.levels.team_leader}</option>
          </NativeSelect>
        </Field>
        {canExport && (
          <Button asChild variant="outline">
            <a href={exportLeadersXlsxUrl(filters)} download>
              {reportsText.exportExcel}
            </a>
          </Button>
        )}
      </div>

      {isPending && <p className="text-muted-foreground">{reportsText.loading}</p>}
      {isError && <p className="text-muted-foreground">{messages.errors.generic}</p>}
      {data && data.items.length === 0 && (
        <p className="text-muted-foreground">{reportsText.empty}</p>
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <Th>{reportsText.table.name}</Th>
                <Th>{reportsText.table.cedula}</Th>
                <Th>{reportsText.table.level}</Th>
                <Th>{reportsText.table.recinto}</Th>
                <Th>{reportsText.table.memberCount}</Th>
                <Th>{reportsText.table.goal}</Th>
                <Th>{reportsText.table.progress}</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((leader) => (
                <tr key={leader.id} className="border-t">
                  <td className="px-3 py-2">{leader.fullName}</td>
                  <td className="px-3 py-2">{formatCedula(leader.cedula)}</td>
                  <td className="px-3 py-2">{messages.levels[leader.level]}</td>
                  <td className="px-3 py-2">
                    {leader.recintoName} · {leader.sector}
                  </td>
                  <td className="px-3 py-2">{leader.memberCount}</td>
                  <td className="px-3 py-2">{leader.goal}</td>
                  <td className="px-3 py-2">
                    {leader.goal > 0 ? Math.round((leader.memberCount / leader.goal) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
