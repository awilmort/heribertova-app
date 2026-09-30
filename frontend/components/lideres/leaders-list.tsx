'use client';

import type { LeaderLevel } from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { NominateAspirantDialog } from '@/components/lideres/nominate-aspirant-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { usePermission } from '@/lib/permissions';
import { api, exportPeopleXlsxUrl } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.lideres;

/** `/lideres` (plan 6.3, "Ptes. CB / APCB" equivalent): leaders and aspirants in the caller's scope
 * (server-enforced, same `scopeFilter` as everywhere else), each with their expandable team, and
 * the "Nominar aspirante" action for roles that hold `leaders.nominate`. */
export function LeadersList() {
  const canNominate = usePermission('leaders.nominate');
  const canExport = usePermission('people.export');
  const [level, setLevel] = useState<LeaderLevel | ''>('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const { data, isPending, isError } = useQuery({
    queryKey: ['leaders', level],
    queryFn: () => api.listLeaders({ level: level || undefined }),
  });

  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
        <div className="flex items-end gap-2">
          {canExport && (
            <Button asChild variant="outline">
              <a href={exportPeopleXlsxUrl({ level: level || undefined })} download>
                {text.exportExcel}
              </a>
            </Button>
          )}
          {canNominate && <NominateAspirantDialog />}
        </div>
      </div>

      {isPending && <p className="text-muted-foreground">{text.loading}</p>}
      {isError && <p className="text-muted-foreground">{messages.errors.generic}</p>}
      {data && data.items.length === 0 && <p className="text-muted-foreground">{text.empty}</p>}

      <div className="flex flex-col gap-3">
        {data?.items.map((leader) => (
          <Card key={leader.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>{leader.fullName}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {messages.levels[leader.level]} · {leader.recintoName} · {leader.sector}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
                  {text.card.memberCount(leader.memberCount, leader.goal)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => toggle(leader.id)}
                aria-expanded={expanded.has(leader.id)}
              >
                {expanded.has(leader.id) ? text.card.hideTeam : text.card.showTeam}
              </Button>
              {expanded.has(leader.id) &&
                (leader.team.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{text.card.teamEmpty}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {leader.team.map((member) => (
                      <li key={member.id} className="flex items-center justify-between text-sm">
                        <span>{member.fullName}</span>
                        <span className="text-muted-foreground">
                          {messages.equipo.docStatus[member.docStatus]}
                        </span>
                      </li>
                    ))}
                  </ul>
                ))}
            </CardContent>
          </Card>
        ))}
      </div>
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
