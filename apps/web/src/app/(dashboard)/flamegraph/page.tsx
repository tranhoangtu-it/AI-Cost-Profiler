'use client';

import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { ChartSkeleton } from '@/components/dashboard/skeleton-loaders';
import type { FlamegraphNode } from '@ai-cost-profiler/shared';
import { useTimeRange } from '@/lib/time-range-context';

const CostFlamegraph = dynamic(
  () => import('@/components/charts/cost-flamegraph').then(mod => ({ default: mod.CostFlamegraph })),
  { ssr: false }
);

export default function FlamegraphPage() {
  const { from, to } = useTimeRange();

  const { data, isLoading } = useQuery({
    queryKey: ['flamegraph', from, to],
    queryFn: () => api.getFlamegraph({ from, to }) as Promise<FlamegraphNode>,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Cost Flamegraph</h1>
      <p className="text-sm text-text-secondary">
        Width = cost. Click to zoom into a feature. Ctrl+Click to reset.
      </p>

      <div className="rounded-lg border border-border-default bg-bg-surface p-5">
        {isLoading && <ChartSkeleton />}
        {data && <CostFlamegraph data={data} />}
        {!isLoading && !data && (
          <p className="text-text-muted">No data for selected time range.</p>
        )}
      </div>
    </div>
  );
}
