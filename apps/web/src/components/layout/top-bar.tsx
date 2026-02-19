'use client';

import { useTimeRange } from '@/lib/time-range-context';

const TIME_RANGES = [
  { label: '1h', value: '1h' as const },
  { label: '6h', value: '6h' as const },
  { label: '24h', value: '24h' as const },
  { label: '7d', value: '7d' as const },
  { label: '30d', value: '30d' as const },
];

export function TopBar() {
  const { range, setRange } = useTimeRange();

  return (
    <header className="h-12 border-b border-border-default bg-bg-surface flex items-center justify-between px-4">
      <div />
      <div className="flex items-center gap-1">
        {TIME_RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`px-3 py-1 text-xs rounded font-mono transition-colors ${
              range === r.value
                ? 'bg-accent-primary text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </header>
  );
}
