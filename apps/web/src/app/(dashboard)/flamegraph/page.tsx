'use client';

import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { FlamegraphNode } from '@ai-cost-profiler/shared';

const CostFlamegraph = dynamic(
  () => import('@/components/charts/cost-flamegraph').then(mod => ({ default: mod.CostFlamegraph })),
  { ssr: false }
);

function getTimeRange() {
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

export default function FlamegraphPage() {
  const { from, to } = getTimeRange();

  const { data, isLoading } = useQuery({
    queryKey: ['flamegraph', from, to],
    queryFn: () => api.getFlamegraph({ from, to }) as Promise<{ data: FlamegraphNode }>,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Cost Flamegraph</h1>
      <p className="text-sm text-text-secondary">
        Width = cost. Click to zoom into a feature. Ctrl+Click to reset.
      </p>

      <div className="rounded-lg border border-border-default bg-bg-surface p-5">
        {isLoading && <p className="text-text-muted">Loading flamegraph...</p>}
        {data?.data && <CostFlamegraph data={data.data} />}
        {!isLoading && !data?.data && (
          <p className="text-text-muted">No data for selected time range.</p>
        )}
      </div>
    </div>
  );
}
