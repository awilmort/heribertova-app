'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { RadialProgress } from '@/components/panel/radial-progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.panel;

/** `/panel` (plan 6.2): the leader dashboard — my progress, aspirants I nominated, missing photos,
 * and this month's birthdays among my direct members. */
export function LeaderDashboard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['dashboards', 'leader'],
    queryFn: api.leaderDashboard,
  });

  if (isPending) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (isError) {
    return <p className="text-muted-foreground">{messages.errors.generic}</p>;
  }

  const progressTitle =
    data.level === 'aspiring_leader' ? text.progress.aspirantTitle : text.progress.leaderTitle;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {text.kpis.members}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{data.memberCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {text.kpis.missingPhotos}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{data.membersMissingCedulaPhoto}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex justify-center pt-6">
          <RadialProgress
            value={data.memberCount}
            goal={data.goal}
            label={`${progressTitle} (${text.progress.of(data.memberCount, data.goal)})`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{text.aspirants.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.nominatedAspirants.length === 0 ? (
            <p className="text-muted-foreground">{text.aspirants.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.nominatedAspirants.map((aspirant) => (
                <li key={aspirant.id} className="flex items-center justify-between text-sm">
                  <span>{aspirant.fullName}</span>
                  <span className="text-muted-foreground">
                    {text.aspirants.memberCount(aspirant.memberCount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{text.birthdays.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.birthdaysThisMonth.length === 0 ? (
            <p className="text-muted-foreground">{text.birthdays.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.birthdaysThisMonth.map((birthday) => (
                <li key={birthday.id} className="flex items-center justify-between text-sm">
                  <span>{birthday.fullName}</span>
                  <span className="text-muted-foreground">{birthday.day}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
