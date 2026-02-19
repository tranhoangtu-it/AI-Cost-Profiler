'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { CostTreemap } from '@/components/charts/cost-treemap';
import { DataTable } from '@/components/dashboard/data-table';
import { ExportButton } from '@/components/dashboard/export-button';
import { TableSkeleton, ChartSkeleton } from '@/components/dashboard/skeleton-loaders';
import { formatCost, formatTokens, formatLatency } from '@/lib/utils';
import type { CostBreakdownItem, FlamegraphNode } from '@ai-cost-profiler/shared';
import { useTimeRange } from '@/lib/time-range-context';

const columns = [
  { key: 'dimension' as const, label: 'Feature' },
  { key: 'totalCostUsd' as const, label: 'Cost', align: 'right' as const, render: (v: unknown) => formatCost(v as number) },
  { key: 'totalTokens' as const, label: 'Tokens', align: 'right' as const, render: (v: unknown) => formatTokens(v as number) },
  { key: 'requestCount' as const, label: 'Calls', align: 'right' as const },
  { key: 'avgLatencyMs' as const, label: 'Avg Latency', align: 'right' as const, render: (v: unknown) => formatLatency(v as number) },
];

export default function FeaturesPage() {
  const { from, to } = useTimeRange();

  const { data: breakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ['cost-breakdown', 'feature', from, to],
    queryFn: () => api.getCostBreakdown({ from, to, groupBy: 'feature' }) as Promise<CostBreakdownItem[]>,
  });

  const { data: flamegraphResp, isLoading: flamegraphLoading } = useQuery({
    queryKey: ['flamegraph', from, to],
    queryFn: () => api.getFlamegraph({ from, to }) as Promise<FlamegraphNode>,
  });

  const items = breakdown ?? [];
  const treemapData = flamegraphResp ?? { name: 'Project', value: 0, children: [] };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Feature Breakdown</h1>
        <ExportButton endpoint="/features" filename="feature-breakdown" />
      </div>

      <div className="rounded-lg border border-border-default bg-bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-secondary mb-4">Cost Treemap</h2>
        {flamegraphLoading ? <ChartSkeleton /> : <CostTreemap data={treemapData} />}
      </div>

      <div className="rounded-lg border border-border-default bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-4">Feature Details</h2>
        {breakdownLoading ? <TableSkeleton /> : <DataTable columns={columns} data={items} />}
      </div>
    </div>
  );
}
