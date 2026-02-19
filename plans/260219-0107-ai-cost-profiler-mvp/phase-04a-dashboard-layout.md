# Phase 4a: Dashboard Layout & Components

## Context Links
- [Design Guidelines](../../docs/design-guidelines.md)
- [Tech Stack](../../docs/tech-stack.md)
- [Plan Overview](./plan.md)

## Parallelization Info
- **Depends on:** Phase 2a (types for API client), Phase 1 (workspace stub)
- **Blocks:** Phase 4b (visualization pages use layout + components)
- **Parallel with:** Phase 3a, Phase 3b

## Overview
- **Priority:** P1
- **Status:** Complete
- **Est:** 4h

Set up Next.js 14 App Router with shadcn/ui, dark theme, sidebar navigation, metric card components, TanStack Query provider, and API client helpers.

## Key Insights
- Dark theme: Grafana/Datadog-inspired (design guidelines colors)
- shadcn/ui for components (copy-paste, no vendor lock-in)
- TanStack Query for all data fetching (cache, refetch, SSE integration)
- Layout: collapsible sidebar + top bar + content area

## Requirements
### Functional
- App Router layout with sidebar nav (5 pages)
- Dark theme with design guideline colors
- Metric card component (label, value, trend)
- Data table component (sortable, monospace numbers)
- TanStack Query provider + API client
- Loading/error states

### Non-Functional
- Responsive: 1-col mobile, 2-col tablet, 3-4 col desktop
- <100ms initial render (after SSR)
- Accessible: focus outlines, keyboard nav, ARIA labels

## Architecture
```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout + providers
│   │   ├── globals.css                 # Tailwind + custom CSS vars
│   │   ├── page.tsx                    # Redirect to /overview
│   │   └── (dashboard)/
│   │       └── layout.tsx              # Dashboard layout (sidebar + topbar)
│   ├── components/
│   │   ├── ui/                         # shadcn/ui generated (Button, Card, etc.)
│   │   ├── layout/
│   │   │   ├── sidebar-nav.tsx         # Sidebar navigation
│   │   │   └── top-bar.tsx             # Top bar with time range picker
│   │   ├── dashboard/
│   │   │   ├── metric-card.tsx         # Reusable metric display card
│   │   │   └── data-table.tsx          # Sortable data table
│   │   └── providers/
│   │       └── query-provider.tsx      # TanStack Query provider (client)
│   └── lib/
│       ├── api-client.ts              # Fetch wrapper for server API
│       └── utils.ts                   # cn() helper, formatters
├── tailwind.config.ts
├── next.config.mjs
├── postcss.config.mjs
├── components.json                     # shadcn/ui config
├── package.json
└── tsconfig.json
```

## File Ownership (Exclusive)
```
apps/web/src/app/layout.tsx
apps/web/src/app/globals.css
apps/web/src/app/page.tsx
apps/web/src/app/(dashboard)/layout.tsx
apps/web/src/components/ui/*
apps/web/src/components/layout/sidebar-nav.tsx
apps/web/src/components/layout/top-bar.tsx
apps/web/src/components/dashboard/metric-card.tsx
apps/web/src/components/dashboard/data-table.tsx
apps/web/src/components/providers/query-provider.tsx
apps/web/src/lib/api-client.ts
apps/web/src/lib/utils.ts
apps/web/tailwind.config.ts
apps/web/next.config.mjs
apps/web/postcss.config.mjs
apps/web/components.json
```

**Phase 4b owns:** `apps/web/src/app/(dashboard)/*/page.tsx` and chart-specific components.

## Implementation Steps

### 1. Update apps/web/package.json
```json
{
  "name": "@ai-cost-profiler/web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@ai-cost-profiler/shared": "workspace:*",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@tanstack/react-query": "^5.28.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "lucide-react": "^0.344.0",
    "@radix-ui/react-slot": "^1.0.0",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-tooltip": "^1.0.0",
    "@radix-ui/react-separator": "^1.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "typescript": "^5.4.0"
  }
}
```

### 2. tailwind.config.ts
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0a0f',
          surface: '#111118',
          elevated: '#1a1a24',
          muted: '#23232f',
        },
        text: {
          primary: '#e8e8ed',
          secondary: '#9494a8',
          muted: '#5c5c72',
        },
        cost: {
          low: '#34d399',
          medium: '#fbbf24',
          high: '#f87171',
          critical: '#ef4444',
        },
        accent: {
          primary: '#818cf8',
          secondary: '#38bdf8',
        },
        border: {
          default: '#1e1e2e',
          focus: '#818cf8',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'SF Mono', 'monospace'],
        sans: ['Inter', 'SF Pro', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
```

### 3. postcss.config.mjs
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### 4. next.config.mjs
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ai-cost-profiler/shared'],
};
export default nextConfig;
```

### 5. src/app/globals.css
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --chart-1: #818cf8;
  --chart-2: #38bdf8;
  --chart-3: #34d399;
  --chart-4: #fbbf24;
  --chart-5: #f87171;
  --chart-6: #c084fc;
  --chart-7: #fb923c;
}

body {
  @apply bg-bg-base text-text-primary font-sans;
}

/* Monospace for numbers */
.font-metric {
  @apply font-mono tabular-nums;
}
```

### 6. src/lib/utils.ts
```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}
```

### 7. src/lib/api-client.ts
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `API error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getCostBreakdown: (params: Record<string, string>) =>
    apiFetch(`/api/v1/analytics/cost-breakdown?${new URLSearchParams(params)}`),
  getFlamegraph: (params: Record<string, string>) =>
    apiFetch(`/api/v1/analytics/flamegraph?${new URLSearchParams(params)}`),
  getTimeseries: (params: Record<string, string>) =>
    apiFetch(`/api/v1/analytics/timeseries?${new URLSearchParams(params)}`),
  getPrompts: (params: Record<string, string>) =>
    apiFetch(`/api/v1/analytics/prompts?${new URLSearchParams(params)}`),
  getRealtimeTotals: () =>
    apiFetch('/api/v1/analytics/realtime-totals'),
};
```

### 8. src/components/providers/query-provider.tsx
```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,      // 30s before refetch
          refetchInterval: 60_000, // Auto-refresh every 60s
          retry: 2,
        },
      },
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### 9. src/components/layout/sidebar-nav.tsx
```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  BarChart3, Flame, LayoutGrid, MessageSquare, Radio,
} from 'lucide-react';

const navItems = [
  { href: '/overview', label: 'Cost Overview', icon: BarChart3 },
  { href: '/features', label: 'Feature Breakdown', icon: LayoutGrid },
  { href: '/flamegraph', label: 'Flamegraph', icon: Flame },
  { href: '/prompts', label: 'Prompt Inspector', icon: MessageSquare },
  { href: '/realtime', label: 'Real-time Feed', icon: Radio },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-border-default bg-bg-surface flex flex-col h-full">
      <div className="p-4 border-b border-border-default">
        <h1 className="text-lg font-semibold text-accent-primary font-mono">
          AI Cost Profiler
        </h1>
      </div>
      <nav className="flex-1 py-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                isActive
                  ? 'text-accent-primary bg-bg-elevated border-l-2 border-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

### 10. src/components/layout/top-bar.tsx
```typescript
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
```

### 11. src/components/dashboard/metric-card.tsx
```typescript
import { cn, formatCost, formatTokens, formatLatency } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: number;
  format?: 'cost' | 'tokens' | 'latency' | 'count';
  trend?: number; // percentage change
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
```

### 12. src/components/dashboard/data-table.tsx
```typescript
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: keyof T;
  label: string;
  align?: 'left' | 'right';
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  className?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortAsc ? cmp : -cmp;
      })
    : data;

  const toggleSort = (key: keyof T) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-bg-muted">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={cn(
                  'px-4 py-2 text-xs uppercase tracking-wider text-text-muted cursor-pointer hover:text-text-secondary',
                  col.align === 'right' ? 'text-right' : 'text-left',
                )}
                onClick={() => toggleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && (sortAsc ? ' ^' : ' v')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              className={cn(
                'border-b border-border-default hover:bg-bg-elevated transition-colors',
                i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-base',
              )}
            >
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className={cn(
                    'px-4 py-2.5',
                    col.align === 'right' ? 'text-right font-mono' : '',
                  )}
                >
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### 13. src/app/(dashboard)/layout.tsx
```typescript
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { TopBar } from '@/components/layout/top-bar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

### 14. src/app/layout.tsx
```typescript
import type { Metadata } from 'next';
import { QueryProvider } from '@/components/providers/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Cost Profiler',
  description: 'LLM cost analysis and optimization dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
```

### 15. src/app/page.tsx
```typescript
import { redirect } from 'next/navigation';
export default function Home() {
  redirect('/overview');
}
```

### 16. Install shadcn/ui base components
Run `npx shadcn@latest init` then add: `card`, `button`, `select`, `badge`, `tooltip`, `separator`, `table`

### 17. Verify
- `pnpm dev --filter @ai-cost-profiler/web`
- Open `http://localhost:3000`
- Sidebar renders; navigation links work
- Dark theme colors correct

## Todo List
- [x] Update `apps/web/package.json`
- [x] Create `tailwind.config.ts`
- [x] Create `postcss.config.mjs`
- [x] Create `next.config.mjs`
- [x] Create `globals.css` with theme vars
- [x] Create `lib/utils.ts`
- [x] Create `lib/api-client.ts`
- [x] Create `components/providers/query-provider.tsx`
- [x] Create `components/layout/sidebar-nav.tsx`
- [x] Create `components/layout/top-bar.tsx`
- [x] Create `components/dashboard/metric-card.tsx`
- [x] Create `components/dashboard/data-table.tsx`
- [x] Create `app/layout.tsx`
- [x] Create `app/(dashboard)/layout.tsx`
- [x] Create `app/page.tsx`
- [x] Init shadcn/ui and add base components
- [x] Verify dark theme rendering

## Success Criteria
- Next.js dev server starts on port 3000
- Sidebar navigation visible with 5 page links
- Dark theme matches design guideline colors
- MetricCard and DataTable render with sample data
- TanStack Query provider wraps the app

## Conflict Prevention
Phase 4a owns layout, shared components, lib, and root configs. Phase 4b owns page files under `(dashboard)/*/page.tsx` and chart-specific components.

## Risk Assessment
- **shadcn/ui compatibility:** Ensure v0.8+ with Next.js 14 App Router
- **Tailwind class conflicts:** Use `cn()` merge utility everywhere
- **Import aliases:** Configure `@/` in tsconfig paths

## Security
- API client uses NEXT_PUBLIC env var (no server secrets exposed)
- No auth in MVP (deferred)

## Next Steps
Phase 4b builds individual visualization pages within this layout.
