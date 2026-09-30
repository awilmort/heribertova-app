'use client';

import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts';
import { BarChart, LineChart } from 'echarts/charts';
import type {
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import type { ComposeOption } from 'echarts/core';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export type EChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
>;

/**
 * A minimal ECharts wrapper (plan 8.1, `/panel/general`): one canvas per mount, resized with its
 * container. `radial-progress.tsx`'s comment named plan 8.1 as the point ECharts earns its place —
 * several real chart types on one dashboard, not a single ring — so this stays a thin adapter
 * rather than growing a chart-specific API; each caller passes its own `option`.
 */
export function EChart({ option, height = 280 }: { option: EChartOption; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container);
    chart.setOption(option);

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
