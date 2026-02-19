'use client';

import { useState } from 'react';

const TIME_RANGES = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
];

export function TopBar() {
  const [range, setRange] = useState('24h');

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
