'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { ExportButton } from '@/components/dashboard/export-button';
import { DataTable } from '@/components/dashboard/data-table';
import { TableSkeleton } from '@/components/dashboard/skeleton-loaders';
import { formatCost, formatTokens, formatLatency } from '@/lib/utils';
import { useTimeRange } from '@/lib/time-range-context';
import type { CostBreakdownItem } from '@ai-cost-profiler/shared';

const columns = [
  { key: 'dimension' as const, label: 'Model' },
  { key: 'totalCostUsd' as const, label: 'Total Cost', align: 'right' as const, render: (v: unknown) => formatCost(v as number) },
  { key: 'requestCount' as const, label: 'Calls', align: 'right' as const },
  { key: 'avgLatencyMs' as const, label: 'Avg Latency', align: 'right' as const, render: (v: unknown) => formatLatency(v as number) },
  { key: 'totalTokens' as const, label: 'Tokens', align: 'right' as const, render: (v: unknown) => formatTokens(v as number) },
];

export default function ModelsPage() {
  const { from, to } = useTimeRange();

  const { data, isLoading } = useQuery({
    queryKey: ['cost-breakdown', 'model', from, to],
    queryFn: () => api.getCostBreakdown({ from, to, groupBy: 'model' }) as Promise<CostBreakdownItem[]>,
  });

  const models = data ?? [];
  const sortedModels = [...models].sort((a, b) => b.totalCostUsd - a.totalCostUsd);

  const totalCost = models.reduce((sum, m) => sum + m.totalCostUsd, 0);
  const totalCalls = models.reduce((sum, m) => sum + m.requestCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">Model Comparison</h1>
          <p className="text-sm text-text-secondary mt-1">
            Compare cost and performance across AI models
          </p>
        </div>
        <ExportButton endpoint="/models" filename="model-comparison" />
      </div>

      {!isLoading && (
        <div className="flex gap-2">
          <span className="px-3 py-1 rounded bg-bg-surface border border-border-default text-sm">
            <span className="text-text-muted">Total cost:</span>{' '}
            <span className="font-mono font-semibold">{formatCost(totalCost)}</span>
          </span>
          <span className="px-3 py-1 rounded bg-bg-surface border border-border-default text-sm">
            <span className="text-text-muted">Total calls:</span>{' '}
            <span className="font-mono">{totalCalls.toLocaleString()}</span>
          </span>
          <span className="px-3 py-1 rounded bg-bg-surface border border-border-default text-sm">
            <span className="text-text-muted">Models:</span>{' '}
            <span className="font-mono">{models.length}</span>
          </span>
        </div>
      )}

      <div className="rounded-lg border border-border-default bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-4">Model Details</h2>
        {isLoading ? (
          <TableSkeleton rows={6} />
        ) : (
          <DataTable columns={columns} data={sortedModels} />
        )}
      </div>
    </div>
  );
}
