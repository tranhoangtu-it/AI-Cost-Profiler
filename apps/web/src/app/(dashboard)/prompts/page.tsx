'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/dashboard/data-table';
import { ExportButton } from '@/components/dashboard/export-button';
import { TableSkeleton } from '@/components/dashboard/skeleton-loaders';
import { formatTokens } from '@/lib/utils';
import type { PromptAnalysis } from '@ai-cost-profiler/shared';
import { useTimeRange } from '@/lib/time-range-context';

const columns = [
  { key: 'content' as const, label: 'Prompt Content', render: (v: unknown) => {
    const text = String(v ?? '');
    return <span className="text-xs truncate block max-w-md">{text.slice(0, 100)}...</span>;
  }},
  { key: 'occurrences' as const, label: 'Uses', align: 'right' as const },
  { key: 'avgTokens' as const, label: 'Avg Tokens', align: 'right' as const, render: (v: unknown) => formatTokens(v as number) },
  { key: 'totalCostUsd' as const, label: 'Total Cost', align: 'right' as const, render: (v: unknown) => `$${(v as number).toFixed(4)}` },
  { key: 'similarPrompts' as const, label: 'Similar', align: 'right' as const, render: (v: unknown) => {
    const similar = v as { promptHash: string; similarity: number; content: string; }[];
    return <span className="text-xs text-text-muted">{similar?.length ?? 0}</span>;
  }},
];

export default function PromptsPage() {
  const { from, to } = useTimeRange();

  const { data, isLoading } = useQuery({
    queryKey: ['prompts', from, to],
    queryFn: () => api.getPrompts({ from, to }) as Promise<PromptAnalysis[]>,
  });

  const items = data ?? [];
  const similarCount = items.filter((i) => i.similarPrompts.length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">Prompt Inspector</h1>
          <p className="text-sm text-text-secondary">
            Analyze prompt patterns and find similar or duplicate prompts to optimize costs.
          </p>
        </div>
        <ExportButton endpoint="/prompts" filename="prompt-analysis" />
      </div>

      {!isLoading && (
        <div className="flex gap-2">
          <span className="px-3 py-1 rounded bg-bg-surface border border-border-default text-sm">
            <span className="text-text-muted">Total analyzed:</span>{' '}
            <span className="font-mono">{items.length}</span>
          </span>
          <span className="px-3 py-1 rounded bg-bg-surface border border-border-default text-sm">
            <span className="text-text-muted">With similar:</span>{' '}
            <span className="font-mono text-cost-medium">{similarCount}</span>
          </span>
        </div>
      )}

      <div className="rounded-lg border border-border-default bg-bg-surface p-4">
        {isLoading ? (
          <TableSkeleton />
        ) : (
          <DataTable columns={columns} data={items} />
        )}
      </div>
    </div>
  );
}
