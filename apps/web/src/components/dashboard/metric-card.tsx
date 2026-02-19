import { cn, formatCost, formatTokens, formatLatency } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: number;
  format?: 'cost' | 'tokens' | 'latency' | 'count';
  trend?: number;
  className?: string;
}

const formatters = {
  cost: formatCost,
  tokens: formatTokens,
  latency: formatLatency,
  count: (n: number) => n.toLocaleString(),
};

export function MetricCard({ label, value, format = 'cost', trend, className }: MetricCardProps) {
  const formatted = formatters[format](value);
  const trendColor = trend === undefined ? '' : trend > 0 ? 'text-cost-high' : 'text-cost-low';
  const trendArrow = trend === undefined ? '' : trend > 0 ? '+' : '';

  return (
    <div className={cn(
      'rounded-lg border border-border-default bg-bg-surface p-5',
      className,
    )}>
      <p className="text-xs uppercase tracking-wider text-text-muted mb-2">{label}</p>
      <p className="text-2xl font-semibold font-mono text-text-primary">{formatted}</p>
      {trend !== undefined && (
        <p className={cn('text-xs font-mono mt-1', trendColor)}>
          {trendArrow}{trend.toFixed(1)}%
        </p>
      )}
    </div>
  );
}
