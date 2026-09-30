'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.miRecinto;

/** Voters/members/colegios/validated-members/leaders for one recinto, plus its name and sector —
 * shared by `/mi-recinto` (plan 7.1) and `/recintos/[key]` (the same detail view for any recinto a
 * general coordinator or superadmin browses to from `/recintos`). */
export function RecintoSummaryCards({ recintoKey }: { recintoKey: string }) {
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
