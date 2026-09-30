'use client';

import type { GeneralDashboardResponse } from '@heribertova/shared';
import { AGE_BANDS, PROGRESS_BUCKETS } from '@heribertova/shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { EChartOption } from '@/components/charts/echart';
import { EChart } from '@/components/charts/echart';
import {
  CHART_LINE_COLOR,
  CHART_SERIES_A,
  CHART_SERIES_B,
  CHART_TEXT_COLOR,
} from '@/components/charts/theme';
import { SectorCoverageTable } from '@/components/panel/sector-coverage-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { messages } from '@/messages/es';

const text = messages.panelGeneral;
const nf = new Intl.NumberFormat('es-DO');

/** A grouped bar chart of two series over a fixed set of categories (plan 8.1's leader-progress
 * and age-band charts share this exact shape — categories in a fixed order, two series compared
 * side by side). */
function groupedBarOption(
  categories: readonly string[],
  seriesA: { name: string; data: readonly number[] },
  seriesB: { name: string; data: readonly number[] },
): EChartOption {
  return {
    color: [CHART_SERIES_A, CHART_SERIES_B],
    legend: { top: 0, textStyle: { color: CHART_TEXT_COLOR } },
    grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category',
      data: [...categories],
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_LINE_COLOR } },
      axisLabel: { color: CHART_TEXT_COLOR },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: CHART_LINE_COLOR } },
      axisLabel: { color: CHART_TEXT_COLOR },
    },
    series: [
      {
        name: seriesA.name,
        type: 'bar',
        data: [...seriesA.data],
        barMaxWidth: 24,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
      {
        name: seriesB.name,
        type: 'bar',
        data: [...seriesB.data],
        barMaxWidth: 24,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}

/** Registrations over the last 30 days (plan 8.1): one series, so no legend box — the card title
 * already names it. */
function registrationsOption(
  points: GeneralDashboardResponse['registrationsOverTime'],
): EChartOption {
  return {
    color: [CHART_SERIES_A],
    grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((point) => `${point.date.slice(8, 10)}/${point.date.slice(5, 7)}`),
      axisLine: { lineStyle: { color: CHART_LINE_COLOR } },
      axisLabel: { color: CHART_TEXT_COLOR },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: CHART_LINE_COLOR } },
      axisLabel: { color: CHART_TEXT_COLOR },
    },
    series: [
      {
        name: text.registrations.seriesName,
        type: 'line',
        data: points.map((point) => point.count),
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: CHART_SERIES_A },
        areaStyle: { color: CHART_SERIES_A, opacity: 0.1 },
      },
    ],
  };
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{nf.format(value)}</p>
      </CardContent>
    </Card>
  );
}

/** `/panel/general` (plan 8.1): the campaign-wide dashboard — coordinators' landing page
 * (`landingFor`, plan 4.1). A recinto coordinator sees the same page narrowed to their own
 * recintos; the API decides the scope, this component only renders what it gets back. */
export function GeneralDashboard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['dashboards', 'general'],
    queryFn: api.generalDashboard,
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

  const leaderProgressOption = groupedBarOption(
    PROGRESS_BUCKETS,
    {
      name: text.leaderProgress.aspiringLeaders,
      data: PROGRESS_BUCKETS.map((bucket) => data.leaderProgress.aspiringLeaders[bucket]),
    },
    {
      name: text.leaderProgress.teamLeaders,
      data: PROGRESS_BUCKETS.map((bucket) => data.leaderProgress.teamLeaders[bucket]),
    },
  );

  const ageBandsOption = groupedBarOption(
    AGE_BANDS,
    {
      name: text.ageBands.voters,
      data: AGE_BANDS.map((band) => data.ageBands[band].voterCount),
    },
    {
      name: text.ageBands.members,
      data: AGE_BANDS.map((band) => data.ageBands[band].memberCount),
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label={text.kpis.voters} value={data.totals.voters} />
        <KpiCard label={text.kpis.totalRegistered} value={data.totals.totalRegistered} />
        <KpiCard label={text.kpis.teamLeaders} value={data.totals.teamLeaders} />
        <KpiCard label={text.kpis.aspiringLeaders} value={data.totals.aspiringLeaders} />
        <KpiCard label={text.kpis.recintos} value={data.totals.recintos} />
        <KpiCard
          label={text.kpis.recintosWithoutMembers}
          value={data.totals.recintosWithoutMembers}
        />
        <KpiCard label={text.kpis.teamsAtGoal} value={data.teamsAtGoal} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{text.sectors.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <SectorCoverageTable items={data.coverageBySector} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{text.registrations.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <EChart option={registrationsOption(data.registrationsOverTime)} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{text.leaderProgress.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={leaderProgressOption} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{text.ageBands.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={ageBandsOption} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{text.birthdays.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.birthdaysThisMonth.upcoming.length === 0 ? (
            <p className="text-muted-foreground">{text.birthdays.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.birthdaysThisMonth.upcoming.map((birthday) => (
                <li key={birthday.id} className="flex items-center justify-between text-sm">
                  <span>{birthday.fullName}</span>
                  <span className="text-muted-foreground">{birthday.day}</span>
                </li>
              ))}
              {data.birthdaysThisMonth.count > data.birthdaysThisMonth.upcoming.length && (
                <li className="text-sm text-muted-foreground">
                  {text.birthdays.more(
                    data.birthdaysThisMonth.count - data.birthdaysThisMonth.upcoming.length,
                  )}
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
