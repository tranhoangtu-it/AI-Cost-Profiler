'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { MetricCard } from '@/components/dashboard/metric-card';
import { CostLineChart } from '@/components/charts/cost-line-chart';
import { CostPieChart } from '@/components/charts/cost-pie-chart';
import { ExportButton } from '@/components/dashboard/export-button';
import { MetricGridSkeleton, ChartSkeleton } from '@/components/dashboard/skeleton-loaders';
import type { CostBreakdownItem, TimeseriesPoint } from '@ai-cost-profiler/shared';
import { useTimeRange } from '@/lib/time-range-context';

export default function OverviewPage() {
  const { from, to } = useTimeRange();

  const { data: breakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ['cost-breakdown', 'model', from, to],
    queryFn: () => api.getCostBreakdown({ from, to, groupBy: 'model' }) as Promise<CostBreakdownItem[]>,
  });

  const { data: timeseries, isLoading: timeseriesLoading } = useQuery({
    queryKey: ['timeseries', from, to],
    queryFn: () => api.getTimeseries({ from, to, granularity: 'hour' }) as Promise<TimeseriesPoint[]>,
  });

  const items = breakdown ?? [];
  const totalCost = items.reduce((sum, i) => sum + i.totalCostUsd, 0);
  const totalTokens = items.reduce((sum, i) => sum + i.totalTokens, 0);
  const totalCalls = items.reduce((sum, i) => sum + i.requestCount, 0);
  const avgLatency = totalCalls > 0
    ? items.reduce((sum, i) => sum + i.avgLatencyMs * i.requestCount, 0) / totalCalls
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Cost Overview</h1>
        <ExportButton endpoint="/events" filename="overview-events" />
      </div>

      {breakdownLoading ? (
        <MetricGridSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Total Cost" value={totalCost} format="cost" />
          <MetricCard label="Total Tokens" value={totalTokens} format="tokens" />
          <MetricCard label="API Calls" value={totalCalls} format="count" />
          <MetricCard label="Avg Latency" value={avgLatency} format="latency" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-secondary mb-4">Cost Over Time</h2>
          {timeseriesLoading ? <ChartSkeleton /> : <CostLineChart data={timeseries ?? []} />}
        </div>
        <div className="rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-secondary mb-4">Cost by Model</h2>
          {breakdownLoading ? <ChartSkeleton /> : <CostPieChart data={items} />}
        </div>
      </div>
    </div>
  );
}
