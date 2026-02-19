---
phase: 3
title: "Dashboard Polish - Date Picker, Export UI, Model Comparison"
status: completed
effort: 16h
dependencies: [1]
---

# Phase 3: Dashboard Polish

## Overview

Wire date picker to all dashboard views, add export buttons, create model comparison view, and display cached token metrics.

**Priority:** P1 (production readiness)
**Effort:** 16h
**Parallelizable:** Yes (runs in parallel with Phase 2)

## Context Links

- Research: `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/plans/reports/researcher-260219-1543-mvp-gaps-analysis.md`
- MVP Phase 4: `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/plans/260219-0107-ai-cost-profiler-mvp/phase-04a-dashboard-layout.md`
- Design Guidelines: `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/docs/design-guidelines.md`

## Key Insights

- Date picker already exists in TopBar but not wired to pages
- `useTimeRange` hook is independent - needs to trigger API refetches
- Export buttons should stream downloads (no page navigation)
- Model comparison needs side-by-side cost/latency metrics
- Cached tokens should show cache hit rate percentage

## Requirements

### Functional
1. **Date Picker Wiring**: Connect TopBar date range to all dashboard pages
2. **Export UI**: Download buttons for CSV/JSON on all views
3. **Model Comparison**: New page with side-by-side model metrics
4. **Cached Token Metrics**: Display cache hit rate, cost savings
5. **Error Rate Charts**: Visualize failed calls, retry patterns
6. **Improved Loading States**: Skeleton loaders, empty states

### Non-Functional
- Export downloads don't block UI
- Date picker state persists in URL params
- Charts render smoothly with 10k+ data points
- Mobile responsive (breakpoint: 768px)

## Architecture

### Date Picker Flow

```
TopBar DateRangePicker
    ↓ (onChange)
useTimeRange hook (zustand)
    ↓ (state update)
Dashboard pages (useEffect)
    ↓ (dependency: timeRange)
API fetch with startDate/endDate params
    ↓
Chart components re-render
```

### Export Flow

```
User clicks "Export CSV"
    ↓
Frontend: fetch('/api/export/events?format=csv&startDate=...')
    ↓
Backend: streams CSV response
    ↓
Frontend: triggers browser download via blob URL
```

## Related Code Files

### To Modify
- `apps/web/src/app/(dashboard)/overview/page.tsx` - Wire date picker
- `apps/web/src/app/(dashboard)/features/page.tsx` - Wire date picker + export button
- `apps/web/src/app/(dashboard)/prompts/page.tsx` - Wire date picker + export button
- `apps/web/src/app/(dashboard)/flamegraph/page.tsx` - Wire date picker
- `apps/web/src/app/(dashboard)/realtime/page.tsx` - Keep real-time (skip date filter)
- `apps/web/src/components/dashboard/top-bar.tsx` - Verify date picker wiring

### To Create
- `apps/web/src/app/(dashboard)/comparison/page.tsx` - Model comparison view
- `apps/web/src/components/dashboard/export-button.tsx` - Reusable export component
- `apps/web/src/components/dashboard/cached-tokens-card.tsx` - Cache metrics widget
- `apps/web/src/components/dashboard/error-rate-chart.tsx` - Error visualization
- `apps/web/src/hooks/use-export.ts` - Export hook with download logic
- `apps/web/src/hooks/use-paginated-data.ts` - Pagination + date filter hook

## Implementation Steps

### 1. Paginated Data Hook (2h)

**File:** `apps/web/src/hooks/use-paginated-data.ts`

```ts
import { useTimeRange } from '@/stores/time-range-store';
import { useState, useEffect } from 'react';

export function usePaginatedData<T>(endpoint: string, filters: Record<string, any> = {}) {
  const { startDate, endDate } = useTimeRange();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const params = new URLSearchParams({
        ...filters,
        startDate: startDate?.toISOString() || '',
        endDate: endDate?.toISOString() || '',
        limit: '100',
        ...(cursor && { cursor })
      });

      const res = await fetch(`/api${endpoint}?${params}`);
      const json = await res.json();

      setData(prev => cursor ? [...prev, ...json.data] : json.data);
      setCursor(json.pagination.nextCursor);
      setHasMore(json.pagination.hasMore);
      setLoading(false);
    }

    fetchData();
  }, [endpoint, startDate, endDate, JSON.stringify(filters), cursor]);

  return { data, loading, hasMore, loadMore: () => setCursor(prev => prev) };
}
```

### 2. Export Hook (1.5h)

**File:** `apps/web/src/hooks/use-export.ts`

```ts
import { useTimeRange } from '@/stores/time-range-store';

export function useExport() {
  const { startDate, endDate } = useTimeRange();

  async function exportData(endpoint: string, format: 'csv' | 'json', filename: string) {
    const params = new URLSearchParams({
      format,
      startDate: startDate?.toISOString() || '',
      endDate: endDate?.toISOString() || ''
    });

    const res = await fetch(`/api/export${endpoint}?${params}`);
    const blob = await res.blob();

    // Trigger download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  return { exportData };
}
```

### 3. Export Button Component (1h)

**File:** `apps/web/src/components/dashboard/export-button.tsx`

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { DownloadIcon } from 'lucide-react';
import { useExport } from '@/hooks/use-export';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ExportButtonProps {
  endpoint: string;
  filename: string;
}

export function ExportButton({ endpoint, filename }: ExportButtonProps) {
  const { exportData } = useExport();
  const [loading, setLoading] = useState(false);

  async function handleExport(format: 'csv' | 'json') {
    setLoading(true);
    try {
      await exportData(endpoint, format, filename);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          <DownloadIcon className="mr-2 h-4 w-4" />
          {loading ? 'Downloading...' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('json')}>
          Export as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 4. Wire Date Picker to Overview Page (1h)

**File:** `apps/web/src/app/(dashboard)/overview/page.tsx`

```tsx
'use client';

import { usePaginatedData } from '@/hooks/use-paginated-data';
import { ExportButton } from '@/components/dashboard/export-button';

export default function OverviewPage() {
  const { data: overview, loading } = usePaginatedData<OverviewMetrics>('/analytics/overview');

  if (loading) return <SkeletonLoader />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1>Overview</h1>
        <ExportButton endpoint="/events" filename="overview-events" />
      </div>

      {/* Existing charts with date-filtered data */}
      <CostOverTimeChart data={overview.costByDay} />
      <TokenUsageChart data={overview.tokensByModel} />
    </div>
  );
}
```

Repeat for:
- Features page
- Prompts page
- Flamegraph page (date filter for underlying data, not visualization)

### 5. Cached Tokens Card (2h)

**File:** `apps/web/src/components/dashboard/cached-tokens-card.tsx`

```tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePaginatedData } from '@/hooks/use-paginated-data';

interface CacheMetrics {
  totalInputTokens: number;
  cachedInputTokens: number;
  cacheHitRate: number;
  costSavings: number;
}

export function CachedTokensCard() {
  const { data, loading } = usePaginatedData<CacheMetrics>('/analytics/cache-metrics');

  if (loading) return <Skeleton className="h-32" />;

  const metrics = data[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt Cache Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Cache Hit Rate</p>
            <p className="text-2xl font-bold">{(metrics.cacheHitRate * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Cost Savings</p>
            <p className="text-2xl font-bold text-green-600">
              ${metrics.costSavings.toFixed(2)}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-sm text-muted-foreground">Cached Tokens</p>
            <p className="text-lg">
              {metrics.cachedInputTokens.toLocaleString()} / {metrics.totalInputTokens.toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

Add to Overview page below cost metrics.

### 6. Error Rate Chart (2h)

**File:** `apps/web/src/components/dashboard/error-rate-chart.tsx`

```tsx
'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { usePaginatedData } from '@/hooks/use-paginated-data';

interface ErrorData {
  timestamp: string;
  totalCalls: number;
  failedCalls: number;
  errorRate: number;
}

export function ErrorRateChart() {
  const { data, loading } = usePaginatedData<ErrorData>('/analytics/error-rate');

  if (loading) return <Skeleton className="h-64" />;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="timestamp" />
        <YAxis label={{ value: 'Error Rate %', angle: -90, position: 'insideLeft' }} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const data = payload[0].payload;
            return (
              <div className="bg-white p-2 border rounded shadow">
                <p className="text-sm">{data.timestamp}</p>
                <p className="text-sm font-bold text-red-600">
                  {(data.errorRate * 100).toFixed(2)}% error rate
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.failedCalls} / {data.totalCalls} calls failed
                </p>
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="errorRate" stroke="#ef4444" fill="#fecaca" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

### 7. Model Comparison Page (4h)

**File:** `apps/web/src/app/(dashboard)/comparison/page.tsx`

```tsx
'use client';

import { usePaginatedData } from '@/hooks/use-paginated-data';
import { ExportButton } from '@/components/dashboard/export-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ModelMetrics {
  model: string;
  provider: string;
  totalCalls: number;
  totalCost: number;
  avgLatency: number;
  p95Latency: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  errorRate: number;
  cacheHitRate: number;
}

export default function ComparisonPage() {
  const { data: models, loading } = usePaginatedData<ModelMetrics>('/analytics/model-comparison');

  if (loading) return <SkeletonTable />;

  // Sort by total cost descending
  const sortedModels = [...models].sort((a, b) => b.totalCost - a.totalCost);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Model Comparison</h1>
          <p className="text-muted-foreground">Compare cost and performance across models</p>
        </div>
        <ExportButton endpoint="/models" filename="model-comparison" />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead className="text-right">Calls</TableHead>
            <TableHead className="text-right">Total Cost</TableHead>
            <TableHead className="text-right">Avg Latency</TableHead>
            <TableHead className="text-right">P95 Latency</TableHead>
            <TableHead className="text-right">Avg Tokens (In/Out)</TableHead>
            <TableHead className="text-right">Error Rate</TableHead>
            <TableHead className="text-right">Cache Hit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedModels.map((model) => (
            <TableRow key={model.model}>
              <TableCell className="font-medium">{model.model}</TableCell>
              <TableCell>{model.provider}</TableCell>
              <TableCell className="text-right">{model.totalCalls.toLocaleString()}</TableCell>
              <TableCell className="text-right font-bold">${model.totalCost.toFixed(2)}</TableCell>
              <TableCell className="text-right">{model.avgLatency.toFixed(0)}ms</TableCell>
              <TableCell className="text-right">{model.p95Latency.toFixed(0)}ms</TableCell>
              <TableCell className="text-right">
                {model.avgInputTokens.toFixed(0)} / {model.avgOutputTokens.toFixed(0)}
              </TableCell>
              <TableCell className="text-right">
                <span className={model.errorRate > 0.05 ? 'text-red-600' : ''}>
                  {(model.errorRate * 100).toFixed(2)}%
                </span>
              </TableCell>
              <TableCell className="text-right">
                {(model.cacheHitRate * 100).toFixed(1)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Visualization: Cost vs Latency scatter plot */}
      <Card>
        <CardHeader>
          <CardTitle>Cost vs Latency</CardTitle>
        </CardHeader>
        <CardContent>
          <ScatterChart width={800} height={400} data={sortedModels}>
            <CartesianGrid />
            <XAxis dataKey="avgLatency" label={{ value: 'Avg Latency (ms)', position: 'insideBottom', offset: -5 }} />
            <YAxis dataKey="totalCost" label={{ value: 'Total Cost ($)', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={<CustomTooltip />} />
            <Scatter data={sortedModels} fill="#8884d8">
              <LabelList dataKey="model" position="top" />
            </Scatter>
          </ScatterChart>
        </CardContent>
      </Card>
    </div>
  );
}
```

Update navigation to include comparison page:
```tsx
// apps/web/src/components/dashboard/sidebar.tsx
const routes = [
  { href: '/overview', label: 'Overview' },
  { href: '/features', label: 'Features' },
  { href: '/comparison', label: 'Model Comparison' }, // NEW
  { href: '/prompts', label: 'Prompts' },
  { href: '/flamegraph', label: 'Flamegraph' },
  { href: '/realtime', label: 'Real-time' },
];
```

### 8. Improve Loading States (2.5h)

Create skeleton loaders for all major components:

**File:** `apps/web/src/components/dashboard/skeleton-loaders.tsx`

```tsx
export function ChartSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-12 w-24" />
      </CardContent>
    </Card>
  );
}
```

Replace loading states in all pages with these components.

## Todo List

- [x] Create TimeRangeContext provider (replaces `use-paginated-data.ts`)
- [x] Create `use-export.ts` hook with blob download logic
- [x] Create `export-button.tsx` component (CSV/JSON dropdown)
- [x] Wire date picker to Overview page via context
- [x] Wire date picker to Features page + add export button
- [x] Wire date picker to Prompts page + add export button
- [x] Wire date picker to Flamegraph page (filter underlying data)
- [x] Create Model Comparison page with table
- [x] Add comparison route to sidebar navigation
- [x] Create skeleton loader components
- [x] Replace all loading states with skeletons
- [ ] Test date picker updates all charts correctly (needs backend)
- [ ] Test export downloads CSV/JSON files (needs backend endpoints)
- [N/A] Create `cached-tokens-card.tsx` component (deferred - backend not ready)
- [N/A] Add cached tokens card to Overview page (deferred)
- [N/A] Create `error-rate-chart.tsx` component (deferred - backend not ready)
- [N/A] Add error rate chart to Overview page (deferred)

## Success Criteria

- [ ] Date picker changes trigger API refetches on all pages
- [ ] Export buttons download valid CSV/JSON files
- [ ] Model comparison table shows all 3 providers
- [ ] Cached tokens card displays accurate cache hit rate
- [ ] Error rate chart renders without errors
- [ ] Skeleton loaders appear during data fetching
- [ ] Charts render smoothly with 10k+ data points
- [ ] Mobile layout stacks components correctly

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Date picker state resets on page navigation | Medium | Persist in URL query params or global store |
| Export downloads block UI | Low | Use async/await with loading state |
| Large datasets crash browser | High | Backend pagination limits, frontend virtual scrolling |
| Chart re-renders cause flicker | Low | Use `useMemo` for data transformations |

## Security Considerations

- Export endpoints should respect date range limits (no full DB dump)
- Sanitize CSV downloads (escape formula injection)
- Rate limit export requests (max 10/hour per IP)

## Next Steps

After Phase 3:
- Phase 4 can write frontend tests for components
- Phase 4 seed data should populate realistic date ranges
- Integration tests verify date picker → API → chart flow
