'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { RecintoVoterList } from '@/components/mi-recinto/recinto-voter-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { api } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.miRecinto;

/**
 * `/mi-recinto` (plan 7.1): which recinto(s) `me` may see — a recinto coordinator's `recintoScopes`
 * when they have any, otherwise the recinto their own person is registered to. That single rule
 * covers every role: a team leader or aspirant always has an empty `recintoScopes`, so they fall
 * straight through to their own recinto; a general coordinator or the superadmin also has an empty
 * `recintoScopes` (never assigned one), so they land on their own recinto too — `/recintos` (plan
 * 7.2) is where they browse every other one.
 */
export function MiRecintoView() {
  const { data: me, isPending: mePending } = useQuery({ queryKey: ['me'], queryFn: api.me });
  const { data: sectors } = useQuery({ queryKey: ['sectors'], queryFn: api.sectors });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (mePending || !me) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  const recintoKeys = me.recintoScopes.length > 0 ? me.recintoScopes : [me.person.recintoKey];
  const activeKey = selectedKey && recintoKeys.includes(selectedKey) ? selectedKey : recintoKeys[0];

  if (!activeKey) {
    return <p className="text-muted-foreground">{text.noRecinto}</p>;
  }

  const recintoOptions = (sectors?.sectors ?? []).flatMap((sector) =>
    sector.recintos
      .filter((recinto) => recintoKeys.includes(recinto.key))
      .map((recinto) => ({ key: recinto.key, name: recinto.name, sectorName: sector.name })),
  );
  const activeColegios =
    sectors?.sectors
      .flatMap((sector) => sector.recintos)
      .find((recinto) => recinto.key === activeKey)?.colegios ?? [];

  return (
    <div className="flex flex-col gap-6">
      {recintoKeys.length > 1 && (
        <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
          <span className="font-medium">{text.recintoLabel}</span>
          <NativeSelect value={activeKey} onChange={(event) => setSelectedKey(event.target.value)}>
            {recintoOptions.map((recinto) => (
              <option key={recinto.key} value={recinto.key}>
                {recinto.name} · {recinto.sectorName}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      <RecintoSummaryCards recintoKey={activeKey} />
      <RecintoVoterList recintoKey={activeKey} colegios={activeColegios} />
    </div>
  );
}

function RecintoSummaryCards({ recintoKey }: { recintoKey: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['recinto', 'summary', recintoKey],
    queryFn: () => api.recintoSummary(recintoKey),
  });

  if (isPending) return <p className="text-muted-foreground">{text.loading}</p>;
  if (isError) return <p className="text-muted-foreground">{messages.errors.generic}</p>;

  const cards: [string, number][] = [
    [text.summary.voters, data.voterCount],
    [text.summary.members, data.memberCount],
    [text.summary.colegios, data.colegioCount],
    [text.summary.validatedMembers, data.validatedMemberCount],
    [text.summary.leaders, data.leaderCount],
  ];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{data.name}</h2>
        <p className="text-sm text-muted-foreground">{data.sector}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
