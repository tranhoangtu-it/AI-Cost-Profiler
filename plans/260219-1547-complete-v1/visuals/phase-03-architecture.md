# Phase 03 Architecture - Date Picker & Export Flow

## Time Range Context Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    TimeRangeProvider                        │
│  (apps/web/src/lib/time-range-context.tsx)                 │
│                                                             │
│  State: { range: '24h', from: ISO, to: ISO }               │
│  Methods: setRange(newRange)                               │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
    ┌──────────────────┐          ┌──────────────────────┐
    │     TopBar       │          │   Dashboard Pages    │
    │  (top-bar.tsx)   │          │ - overview/page.tsx  │
    │                  │          │ - features/page.tsx  │
    │  Buttons write   │          │ - prompts/page.tsx   │
    │  to context via  │          │ - models/page.tsx    │
    │  setRange()      │          │ - flamegraph/page.tsx│
    └──────────────────┘          └──────────┬────────────┘
                                             │
                                             ▼
                                  ┌──────────────────────┐
                                  │   React Query        │
                                  │   useQuery({         │
                                  │     key: [from, to], │
                                  │     fn: api.get()    │
                                  │   })                 │
                                  └──────────────────────┘
```

## Export Button Flow

```
User clicks "Export" → Dropdown opens (CSV/JSON)
                            │
                            ▼
              User selects format (e.g., CSV)
                            │
                            ▼
              ┌─────────────────────────────┐
              │  useExport hook             │
              │  (use-export.ts)            │
              │                             │
              │  1. Get from/to from context│
              │  2. Build URL with params   │
              │  3. fetch(endpoint?params)  │
              │  4. Convert to Blob         │
              │  5. Create download link    │
              │  6. Trigger download        │
              │  7. Cleanup blob URL        │
              └─────────────────────────────┘
                            │
                            ▼
              Backend: GET /api/v1/export/{endpoint}
                       ?format=csv&from=ISO&to=ISO
                            │
                            ▼
              Browser downloads:
              "model-comparison-2026-02-19.csv"
```

## Component Hierarchy

```
DashboardLayout (wrapped with TimeRangeProvider)
├── SidebarNav
│   ├── Overview
│   ├── Features
│   ├── Models (NEW)
│   ├── Flamegraph
│   ├── Prompts
│   └── Real-time
├── TopBar
│   └── TimeRangeButtons [1h|6h|24h|7d|30d]
└── Main
    └── Page Content
        ├── ExportButton (CSV/JSON dropdown)
        ├── MetricCards or Table
        └── Charts (auto-refetch on range change)
```

## Skeleton Loader States

```
Before Data Loads:
┌─────────────────────────────────────┐
│ ████████░░░░░░░░░░░░  (ChartSkeleton)│
│ ░░░░░░░░░░░░░░░░░░░░                │
│ ░░░░░░░░░░░░░░░░░░░░                │
└─────────────────────────────────────┘

After Data Loads:
┌─────────────────────────────────────┐
│ Cost Over Time                      │
│   ╱╲                                │
│  ╱  ╲    ╱╲                         │
│ ╱    ╲  ╱  ╲                        │
└─────────────────────────────────────┘
```

## File Structure

```
apps/web/src/
├── lib/
│   └── time-range-context.tsx        (NEW - Provider + hook)
├── hooks/
│   └── use-export.ts                 (NEW - Export logic)
├── components/
│   ├── layout/
│   │   ├── top-bar.tsx               (MODIFIED - Uses context)
│   │   └── sidebar-nav.tsx           (MODIFIED - Added /models)
│   └── dashboard/
│       ├── export-button.tsx         (NEW - Dropdown component)
│       └── skeleton-loaders.tsx      (NEW - 4 skeleton types)
└── app/(dashboard)/
    ├── layout.tsx                    (MODIFIED - Wrapped with provider)
    ├── overview/page.tsx             (MODIFIED - Context + export + skeletons)
    ├── features/page.tsx             (MODIFIED - Context + export + skeletons)
    ├── prompts/page.tsx              (MODIFIED - Context + export + skeletons)
    ├── flamegraph/page.tsx           (MODIFIED - Context + skeletons)
    └── models/page.tsx               (NEW - Model comparison table)
```

## Data Flow Example: Changing Time Range

```
1. User clicks "7d" button in TopBar
        │
        ▼
2. setRange('7d') called in context
        │
        ▼
3. Context calculates: from = now - 7 days, to = now
        │
        ▼
4. All pages using useTimeRange() get new from/to
        │
        ▼
5. React Query sees key change: ['breakdown', 'model', OLD_FROM, OLD_TO]
                                                         ↓
                                 ['breakdown', 'model', NEW_FROM, NEW_TO]
        │
        ▼
6. React Query refetches API with new params
        │
        ▼
7. Charts re-render with new data
```

## Export Endpoints (Backend Implementation Needed)

```
GET /api/v1/export/events?format=csv&from=2026-02-12&to=2026-02-19
GET /api/v1/export/features?format=json&from=2026-02-12&to=2026-02-19
GET /api/v1/export/prompts?format=csv&from=2026-02-12&to=2026-02-19
GET /api/v1/export/models?format=csv&from=2026-02-12&to=2026-02-19

Response Headers:
  Content-Type: text/csv | application/json
  Content-Disposition: attachment; filename="export.csv"

Body: CSV rows or JSON array
```

## Key Implementation Details

### TimeRangeContext Benefits
- Single source of truth for date range
- Automatic refetch via React Query key invalidation
- No prop drilling
- Memoized calculations prevent unnecessary renders

### Export Button UX
- Dropdown prevents accidental clicks
- Loading state disables button during download
- Timestamp in filename prevents overwrites
- Error handling with alert fallback

### Skeleton Loaders
- Instant feedback on data loading
- Consistent sizing with actual content
- Pulse animation via Tailwind
- Specific skeletons per content type (chart vs table vs card)

### Model Comparison Page
- Server-side sorting by cost
- Summary stats above table
- Responsive grid for mobile
- Export functionality included
