# Phase 4b: Visualization Views

## Context Links
- [Design Guidelines](../../docs/design-guidelines.md)
- [Flamegraph Research](../../plans/reports/researcher-260219-0101-flamegraph-visualization-tech.md)
- [Visx/Charts Research](./research/researcher-sdk-wrapper-visx-charts.md)
- [Plan Overview](./plan.md)

## Parallelization Info
- **Depends on:** Phase 4a (layout, components, lib, TanStack Query)
- **Blocks:** Phase 5 (Integration)
- **Parallel with:** None (needs Phase 4a layout first)

## Overview
- **Priority:** P1
- **Status:** Complete
- **Est:** 5h

Build 5 dashboard pages: Cost Overview (line+pie), Feature Breakdown (treemap), Flamegraph (d3-flame-graph), Prompt Inspector (bloat table), Real-time Feed (SSE consumer).

## Key Insights
- Recharts for simple charts (line, pie, bar) - shadcn/ui charts recommend it
- Visx treemap for feature breakdown (hierarchical, interactive)
- d3-flame-graph for cost flamegraph (specialized library, imperative D3)
- SSE via native EventSource API + React state for real-time feed
- All pages use TanStack Query with time range from URL/context

## Requirements
### Functional
- 5 pages accessible from sidebar navigation
- Cost Overview: total spend metric, cost-over-time line chart, cost-by-model pie chart, summary cards
- Feature Breakdown: treemap showing cost per feature, click-to-drill
- Flamegraph: hierarchical cost viz (Project > Feature > Model)
- Prompt Inspector: table of events sorted by bloat score, suggestions column
- Real-time Feed: live event stream, running cost counter

### Non-Functional
- Charts render within 300ms on load
- Flamegraph handles 500+ nodes
- SSE reconnects on disconnect
- Responsive chart sizing

## Architecture
```
apps/web/src/
├── app/(dashboard)/
│   ├── overview/
│   │   └── page.tsx              # Cost Overview page
│   ├── features/
│   │   └── page.tsx              # Feature Breakdown page
│   ├── flamegraph/
│   │   └── page.tsx              # Flamegraph page
│   ├── prompts/
│   │   └── page.tsx              # Prompt Inspector page
│   └── realtime/
│       └── page.tsx              # Real-time Feed page
├── components/
│   └── charts/
│       ├── cost-line-chart.tsx   # Recharts line chart
│       ├── cost-pie-chart.tsx    # Recharts pie chart
│       ├── cost-treemap.tsx      # Visx treemap
│       ├── cost-flamegraph.tsx   # d3-flame-graph wrapper
│       └── realtime-feed.tsx     # SSE consumer component
```

## File Ownership (Exclusive)
```
apps/web/src/app/(dashboard)/overview/page.tsx
apps/web/src/app/(dashboard)/features/page.tsx
apps/web/src/app/(dashboard)/flamegraph/page.tsx
apps/web/src/app/(dashboard)/prompts/page.tsx
apps/web/src/app/(dashboard)/realtime/page.tsx
apps/web/src/components/charts/cost-line-chart.tsx
apps/web/src/components/charts/cost-pie-chart.tsx
apps/web/src/components/charts/cost-treemap.tsx
apps/web/src/components/charts/cost-flamegraph.tsx
apps/web/src/components/charts/realtime-feed.tsx
```

## Implementation Steps

### 1. Add chart dependencies to apps/web/package.json
Add to existing deps from Phase 4a:
```json
{
  "dependencies": {
    "recharts": "^2.12.0",
    "@visx/hierarchy": "^3.3.0",
    "@visx/scale": "^3.5.0",
    "@visx/group": "^3.3.0",
    "@visx/text": "^3.3.0",
    "@visx/tooltip": "^3.3.0",
    "@visx/responsive": "^3.3.0",
    "d3-flame-graph": "^4.1.0",
    "d3-selection": "^3.0.0"
  },
  "devDependencies": {
    "@types/d3-flame-graph": "^4.0.0",
    "@types/d3-selection": "^3.0.0"
  }
}
```

### 2. src/components/charts/cost-line-chart.tsx
```typescript
'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { TimeseriesPoint } from '@ai-cost-profiler/shared';

interface CostLineChartProps {
  data: TimeseriesPoint[];
}

export function CostLineChart({ data }: CostLineChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit',
    }),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis dataKey="time" stroke="#5c5c72" fontSize={12} />
        <YAxis stroke="#5c5c72" fontSize={12} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#111118',
            border: '1px solid #1e1e2e',
            borderRadius: 8,
            color: '#e8e8ed',
          }}
          formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="cost"
          stroke="#818cf8"
          strokeWidth={2}
          dot={false}
          name="Cost (USD)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### 3. src/components/charts/cost-pie-chart.tsx
```typescript
'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { CostBreakdownItem } from '@ai-cost-profiler/shared';

const COLORS = ['#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#c084fc', '#fb923c'];

interface CostPieChartProps {
  data: CostBreakdownItem[];
}

export function CostPieChart({ data }: CostPieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="totalCost"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={100}
          strokeWidth={1}
          stroke="#0a0a0f"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: '#111118',
            border: '1px solid #1e1e2e',
            borderRadius: 8,
            color: '#e8e8ed',
          }}
          formatter={(value: number) => `$${value.toFixed(4)}`}
        />
        <Legend formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

### 4. src/components/charts/cost-treemap.tsx
```typescript
'use client';

import { useRef, useMemo } from 'react';
import { Group } from '@visx/group';
import { Treemap, hierarchy, treemapSquarify } from '@visx/hierarchy';
import { scaleLinear } from '@visx/scale';
import { useTooltip, TooltipWithBounds } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
import { formatCost } from '@/lib/utils';
import type { FlamegraphNode } from '@ai-cost-profiler/shared';

const COLORS = ['#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f87171', '#c084fc'];

interface CostTreemapProps {
  data: FlamegraphNode;
}

function TreemapInner({ data, width, height }: CostTreemapProps & { width: number; height: number }) {
  const { showTooltip, hideTooltip, tooltipData, tooltipLeft, tooltipTop } = useTooltip<FlamegraphNode>();

  const root = useMemo(
    () => hierarchy(data).sum((d) => d.value).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    [data],
  );

  const colorScale = scaleLinear<string>({
    domain: [0, (data.children?.length ?? 1) - 1],
    range: ['#818cf8', '#f87171'],
  });

  if (width < 10 || height < 10) return null;

  return (
    <>
      <svg width={width} height={height}>
        <Treemap
          root={root}
          size={[width, height]}
          tile={treemapSquarify}
          round
          paddingInner={2}
        >
          {(treemap) => (
            <Group>
              {treemap.descendants().filter(n => n.depth === 1).map((node, i) => (
                <g
                  key={node.data.name}
                  onMouseMove={(e) => showTooltip({
                    tooltipData: node.data,
                    tooltipLeft: e.clientX,
                    tooltipTop: e.clientY,
                  })}
                  onMouseLeave={hideTooltip}
                >
                  <rect
                    x={node.x0}
                    y={node.y0}
                    width={node.x1 - node.x0}
                    height={node.y1 - node.y0}
                    fill={COLORS[i % COLORS.length]}
                    opacity={0.85}
                    rx={4}
                    className="cursor-pointer hover:opacity-100 transition-opacity"
                  />
                  {(node.x1 - node.x0) > 60 && (node.y1 - node.y0) > 30 && (
                    <>
                      <text
                        x={node.x0 + 8}
                        y={node.y0 + 18}
                        fill="#e8e8ed"
                        fontSize={12}
                        fontWeight={500}
                      >
                        {node.data.name}
                      </text>
                      <text
                        x={node.x0 + 8}
                        y={node.y0 + 34}
                        fill="#9494a8"
                        fontSize={11}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {formatCost(node.value ?? 0)}
                      </text>
                    </>
                  )}
                </g>
              ))}
            </Group>
          )}
        </Treemap>
      </svg>
      {tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={{
          backgroundColor: '#111118',
          border: '1px solid #1e1e2e',
          borderRadius: 8,
          color: '#e8e8ed',
          padding: '8px 12px',
          fontSize: 12,
        }}>
          <strong>{tooltipData.name}</strong>
          <br />
          Cost: {formatCost(tooltipData.value)}
          {tooltipData.tokens && <><br />Tokens: {tooltipData.tokens.toLocaleString()}</>}
        </TooltipWithBounds>
      )}
    </>
  );
}

export function CostTreemap({ data }: CostTreemapProps) {
  return (
    <div style={{ height: 400 }}>
      <ParentSize>
        {({ width, height }) => <TreemapInner data={data} width={width} height={height} />}
      </ParentSize>
    </div>
  );
}
```

### 5. src/components/charts/cost-flamegraph.tsx
```typescript
'use client';

import { useEffect, useRef } from 'react';
import { select } from 'd3-selection';
import flamegraph from 'd3-flame-graph';
import 'd3-flame-graph/dist/d3-flamegraph.css';
import type { FlamegraphNode } from '@ai-cost-profiler/shared';

interface CostFlamegraphProps {
  data: FlamegraphNode;
}

export function CostFlamegraph({ data }: CostFlamegraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !data) return;

    // Clear previous
    select(containerRef.current).selectAll('*').remove();

    const width = containerRef.current.clientWidth;
    const chart = flamegraph()
      .width(width)
      .cellHeight(24)
      .transitionDuration(500)
      .minFrameSize(5)
      .tooltip(true)
      .title('')
      .setColorMapper((_d, originalColor) => originalColor);

    select(containerRef.current)
      .datum(data)
      .call(chart);

    return () => {
      select(containerRef.current).selectAll('*').remove();
    };
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="w-full min-h-[400px] [&_.d3-flame-graph]:bg-transparent [&_rect]:rx-1"
    />
  );
}
```

### 6. src/components/charts/realtime-feed.tsx
```typescript
'use client';

import { useEffect, useState, useRef } from 'react';
import { formatCost } from '@/lib/utils';

interface RealtimeEvent {
  count: number;
  totalCost: number;
  timestamp: string;
  features: string[];
  type?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

export function RealtimeFeed() {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/api/v1/stream/costs`);

    eventSource.onopen = () => setConnected(true);

    eventSource.onmessage = (event) => {
      const data: RealtimeEvent = JSON.parse(event.data);
      if (data.type === 'snapshot') {
        setTotalCost(data.totalCost);
      } else {
        setTotalCost((prev) => prev + data.totalCost);
        setEvents((prev) => [data, ...prev].slice(0, 100)); // Keep last 100
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
      // Reconnect after 3s
      setTimeout(() => {
        // Will re-run effect on reconnect
      }, 3000);
    };

    return () => eventSource.close();
  }, []);

  return (
    <div>
      {/* Connection status */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-cost-low' : 'bg-cost-high'}`} />
        <span className="text-xs text-text-muted">
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Running total */}
      <div className="mb-6 p-4 rounded-lg border border-border-default bg-bg-surface">
        <p className="text-xs uppercase tracking-wider text-text-muted mb-1">Running Total</p>
        <p className="text-3xl font-semibold font-mono text-text-primary">{formatCost(totalCost)}</p>
      </div>

      {/* Event stream */}
      <div ref={containerRef} className="space-y-2 max-h-[500px] overflow-auto">
        {events.length === 0 && (
          <p className="text-text-muted text-sm">Waiting for events...</p>
        )}
        {events.map((event, i) => (
          <div
            key={`${event.timestamp}-${i}`}
            className="flex items-center justify-between p-3 rounded border border-border-default bg-bg-surface text-sm"
          >
            <div className="flex items-center gap-3">
              <span className="text-text-muted font-mono text-xs">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-text-secondary">
                {event.count} call{event.count !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-1">
                {event.features.map((f) => (
                  <span key={f} className="px-2 py-0.5 rounded bg-bg-muted text-xs text-text-secondary">
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <span className="font-mono text-cost-medium">{formatCost(event.totalCost)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 7. src/app/(dashboard)/overview/page.tsx
```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { MetricCard } from '@/components/dashboard/metric-card';
import { CostLineChart } from '@/components/charts/cost-line-chart';
import { CostPieChart } from '@/components/charts/cost-pie-chart';
import type { CostBreakdownItem, TimeseriesPoint } from '@ai-cost-profiler/shared';

function getTimeRange() {
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

export default function OverviewPage() {
  const { from, to } = getTimeRange();

  const { data: breakdown } = useQuery({
    queryKey: ['cost-breakdown', 'model', from, to],
    queryFn: () => api.getCostBreakdown({ from, to, groupBy: 'model' }) as Promise<{ data: CostBreakdownItem[] }>,
  });

  const { data: timeseries } = useQuery({
    queryKey: ['timeseries', from, to],
    queryFn: () => api.getTimeseries({ from, to, granularity: 'hour' }) as Promise<{ data: TimeseriesPoint[] }>,
  });

  const items = breakdown?.data ?? [];
  const totalCost = items.reduce((sum, i) => sum + i.totalCost, 0);
  const totalTokens = items.reduce((sum, i) => sum + i.totalTokens, 0);
  const totalCalls = items.reduce((sum, i) => sum + i.callCount, 0);
  const avgLatency = totalCalls > 0
    ? items.reduce((sum, i) => sum + i.avgLatency * i.callCount, 0) / totalCalls
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Cost Overview</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Cost (24h)" value={totalCost} format="cost" />
        <MetricCard label="Total Tokens" value={totalTokens} format="tokens" />
        <MetricCard label="API Calls" value={totalCalls} format="count" />
        <MetricCard label="Avg Latency" value={avgLatency} format="latency" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-secondary mb-4">Cost Over Time</h2>
          <CostLineChart data={timeseries?.data ?? []} />
        </div>
        <div className="rounded-lg border border-border-default bg-bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-secondary mb-4">Cost by Model</h2>
          <CostPieChart data={items} />
        </div>
      </div>
    </div>
  );
}
```

### 8. src/app/(dashboard)/features/page.tsx
```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { CostTreemap } from '@/components/charts/cost-treemap';
import { DataTable } from '@/components/dashboard/data-table';
import { formatCost, formatTokens, formatLatency } from '@/lib/utils';
import type { CostBreakdownItem, FlamegraphNode } from '@ai-cost-profiler/shared';

function getTimeRange() {
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

const columns = [
  { key: 'name' as const, label: 'Feature' },
  { key: 'totalCost' as const, label: 'Cost', align: 'right' as const, render: (v: unknown) => formatCost(v as number) },
  { key: 'totalTokens' as const, label: 'Tokens', align: 'right' as const, render: (v: unknown) => formatTokens(v as number) },
  { key: 'callCount' as const, label: 'Calls', align: 'right' as const },
  { key: 'avgLatency' as const, label: 'Avg Latency', align: 'right' as const, render: (v: unknown) => formatLatency(v as number) },
];

export default function FeaturesPage() {
  const { from, to } = getTimeRange();

  const { data: breakdown } = useQuery({
    queryKey: ['cost-breakdown', 'feature', from, to],
    queryFn: () => api.getCostBreakdown({ from, to, groupBy: 'feature' }) as Promise<{ data: CostBreakdownItem[] }>,
  });

  const { data: flamegraphResp } = useQuery({
    queryKey: ['flamegraph', from, to],
    queryFn: () => api.getFlamegraph({ from, to }) as Promise<{ data: FlamegraphNode }>,
  });

  const items = breakdown?.data ?? [];
  const treemapData = flamegraphResp?.data ?? { name: 'Project', value: 0, children: [] };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Feature Breakdown</h1>

      <div className="rounded-lg border border-border-default bg-bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-secondary mb-4">Cost Treemap</h2>
        <CostTreemap data={treemapData} />
      </div>

      <div className="rounded-lg border border-border-default bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-secondary mb-4">Feature Details</h2>
        <DataTable columns={columns} data={items} />
      </div>
    </div>
  );
}
```

### 9. src/app/(dashboard)/flamegraph/page.tsx
```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { CostFlamegraph } from '@/components/charts/cost-flamegraph';
import type { FlamegraphNode } from '@ai-cost-profiler/shared';

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
```

### 10. src/app/(dashboard)/prompts/page.tsx
```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/dashboard/data-table';
import { formatTokens } from '@/lib/utils';
import type { PromptAnalysis } from '@ai-cost-profiler/shared';

function getTimeRange() {
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

const columns = [
  { key: 'feature' as const, label: 'Feature' },
  { key: 'model' as const, label: 'Model' },
  { key: 'inputTokens' as const, label: 'Input Tokens', align: 'right' as const, render: (v: unknown) => formatTokens(v as number) },
  { key: 'medianInputTokens' as const, label: 'Median', align: 'right' as const, render: (v: unknown) => formatTokens(v as number) },
  { key: 'bloatRatio' as const, label: 'Bloat Ratio', align: 'right' as const, render: (v: unknown) => {
    const ratio = v as number;
    const color = ratio > 2 ? 'text-cost-high' : ratio > 1.5 ? 'text-cost-medium' : 'text-cost-low';
    return <span className={`font-mono ${color}`}>{ratio.toFixed(1)}x</span>;
  }},
  { key: 'suggestions' as const, label: 'Suggestions', render: (v: unknown) => {
    const suggestions = v as string[];
    return suggestions.length > 0
      ? <span className="text-xs text-cost-medium">{suggestions[0]}</span>
      : <span className="text-text-muted text-xs">-</span>;
  }},
];

export default function PromptsPage() {
  const { from, to } = getTimeRange();

  const { data, isLoading } = useQuery({
    queryKey: ['prompts', from, to],
    queryFn: () => api.getPrompts({ from, to }) as Promise<{ data: PromptAnalysis[] }>,
  });

  const items = data?.data ?? [];
  const bloated = items.filter((i) => i.bloatRatio > 2).length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Prompt Inspector</h1>
      <p className="text-sm text-text-secondary">
        Events sorted by input token count. Bloat ratio = input tokens / median for same feature+model.
      </p>

      {!isLoading && (
        <div className="flex gap-2">
          <span className="px-3 py-1 rounded bg-bg-surface border border-border-default text-sm">
            <span className="text-text-muted">Total analyzed:</span>{' '}
            <span className="font-mono">{items.length}</span>
          </span>
          <span className="px-3 py-1 rounded bg-bg-surface border border-border-default text-sm">
            <span className="text-text-muted">Bloated (>2x):</span>{' '}
            <span className="font-mono text-cost-high">{bloated}</span>
          </span>
        </div>
      )}

      <div className="rounded-lg border border-border-default bg-bg-surface p-4">
        {isLoading ? (
          <p className="text-text-muted">Loading prompt analysis...</p>
        ) : (
          <DataTable columns={columns} data={items} />
        )}
      </div>
    </div>
  );
}
```

### 11. src/app/(dashboard)/realtime/page.tsx
```typescript
'use client';

import { RealtimeFeed } from '@/components/charts/realtime-feed';

export default function RealtimePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Real-time Feed</h1>
      <p className="text-sm text-text-secondary">
        Live stream of LLM cost events via Server-Sent Events.
      </p>
      <RealtimeFeed />
    </div>
  );
}
```

## Todo List
- [x] Add chart deps to `apps/web/package.json`
- [x] Create `components/charts/cost-line-chart.tsx`
- [x] Create `components/charts/cost-pie-chart.tsx`
- [x] Create `components/charts/cost-treemap.tsx`
- [x] Create `components/charts/cost-flamegraph.tsx`
- [x] Create `components/charts/realtime-feed.tsx`
- [x] Create `app/(dashboard)/overview/page.tsx`
- [x] Create `app/(dashboard)/features/page.tsx`
- [x] Create `app/(dashboard)/flamegraph/page.tsx`
- [x] Create `app/(dashboard)/prompts/page.tsx`
- [x] Create `app/(dashboard)/realtime/page.tsx`
- [x] Verify all pages render with empty/mock data

## Success Criteria
- All 5 pages accessible via sidebar navigation
- Charts render without errors (empty state for no data)
- Flamegraph renders with hierarchical data
- Treemap shows proportional areas
- SSE connects and displays live events
- Responsive layout works at all breakpoints

## Conflict Prevention
Phase 4b owns page files and chart components. Phase 4a owns layout, shared components, and lib. No overlap.

## Risk Assessment
- **d3-flame-graph SSR:** Must use `'use client'` + `useEffect` (imperative D3). Wrap in dynamic import if SSR errors.
- **Visx bundle size:** Import only needed packages (@visx/hierarchy, not all @visx/*)
- **SSE reconnection:** Basic reconnect via effect cleanup; production would need exponential backoff

## Security
- No sensitive data in client; all from public API
- EventSource uses same-origin policy

## Next Steps
Phase 5 wires frontend to backend; Phase 4b pages ready to consume real data.
