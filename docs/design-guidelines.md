# Design Guidelines - AI Cost Profiler

## Design Philosophy
Data-dense, developer-focused dashboard. Prioritize scanability and information hierarchy. Inspired by Grafana/Datadog aesthetic: dark theme, tight spacing, high data density with clear visual separation.

## Color Palette (Dark Theme)

### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#0a0a0f` | Page background |
| `--bg-surface` | `#111118` | Card/panel background |
| `--bg-elevated` | `#1a1a24` | Hover states, active panels |
| `--bg-muted` | `#23232f` | Table rows (alt), dividers |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#e8e8ed` | Headings, key metrics |
| `--text-secondary` | `#9494a8` | Labels, descriptions |
| `--text-muted` | `#5c5c72` | Disabled, timestamps |

### Cost Severity (semantic)
| Token | Hex | Usage |
|-------|-----|-------|
| `--cost-low` | `#34d399` | Low cost / healthy |
| `--cost-medium` | `#fbbf24` | Medium cost / warning |
| `--cost-high` | `#f87171` | High cost / alert |
| `--cost-critical` | `#ef4444` | Critical / over-budget |

### Accent & Brand
| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-primary` | `#818cf8` | Primary actions, links, active states |
| `--accent-secondary` | `#38bdf8` | Secondary highlights, charts |
| `--border-default` | `#1e1e2e` | Card borders, separators |
| `--border-focus` | `#818cf8` | Focus rings |

### Chart Palette (sequential)
`#818cf8`, `#38bdf8`, `#34d399`, `#fbbf24`, `#f87171`, `#c084fc`, `#fb923c`

## Typography

### Font Stack
- **Metrics/Numbers**: `"JetBrains Mono", "Fira Code", "SF Mono", monospace`
- **Labels/Body**: `"Inter", "SF Pro", system-ui, sans-serif`

### Scale
| Level | Size | Weight | Font | Usage |
|-------|------|--------|------|-------|
| Display | 28px | 600 | Mono | Hero metric (total cost) |
| H1 | 20px | 600 | Sans | Page title |
| H2 | 16px | 600 | Sans | Section/card title |
| H3 | 14px | 500 | Sans | Subsection |
| Body | 14px | 400 | Sans | Descriptions |
| Caption | 12px | 400 | Sans | Labels, timestamps |
| Metric-lg | 24px | 600 | Mono | Card metric value |
| Metric-sm | 14px | 500 | Mono | Table values, inline metrics |

## Spacing & Layout

### Spacing Scale
`4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `48px`

### Layout Grid
- **Container max-width**: `1440px`, centered with `16px` side padding
- **Grid**: CSS Grid, `12-column` system
- **Card gap**: `16px` (desktop), `12px` (tablet), `8px` (mobile)
- **Card padding**: `20px` (desktop), `16px` (mobile)
- **Card border-radius**: `8px`

### Responsive Breakpoints
| Name | Width | Columns | Behavior |
|------|-------|---------|----------|
| Mobile | `<768px` | 1 | Stack all cards vertically |
| Tablet | `768-1023px` | 2 | Summary cards 2-col, charts stack |
| Desktop | `1024-1439px` | 3 | Standard layout |
| Wide | `1440px+` | 4 | Full 4-col summary row |

## Component Patterns

### Metric Card
- Surface background, 1px border (`--border-default`)
- Label (caption, `--text-secondary`) top, value (metric-lg, `--text-primary`) center
- Optional trend indicator: arrow + percentage, colored by cost severity
- Optional sparkline bottom

### Data Table
- Header row: `--bg-muted`, uppercase caption, `--text-muted`
- Alternating rows: `--bg-surface` / `--bg-base`
- Sortable columns with arrow indicator
- Monospace for numeric columns
- Row hover: `--bg-elevated`

### Chart Container
- Card wrapper with title (H2) + time range selector top-right
- Chart area min-height `240px` (desktop), `180px` (mobile)
- Legend below or inline, using chart palette colors

### Flamegraph Bar
- Horizontal stacking bars, width proportional to cost
- Color intensity maps to cost severity
- Hover tooltip with details, click to zoom/drill-down
- Breadcrumb navigation for zoom levels

### Status Indicator
- Dot (8px circle) + label: green/yellow/red for health status
- Used for cache efficiency, prompt bloat level

### Navigation
- Left sidebar (collapsible on mobile): icon + label
- Active state: `--accent-primary` left border + tinted background
- Top bar: app title, time range picker, refresh button

## shadcn/ui Component Mapping
| Pattern | shadcn Component |
|---------|-----------------|
| Metric Card | `Card` + `CardHeader` + `CardContent` |
| Data Table | `Table` + `TableHeader` + `TableRow` |
| Navigation | `Sidebar` + `SidebarMenu` |
| Time Picker | `Select` / `Popover` + `Calendar` |
| Flamegraph Tooltip | `Tooltip` / `HoverCard` |
| Status Indicator | `Badge` (variant: success/warning/destructive) |
| Charts | Recharts (shadcn/ui charts) |

## Accessibility
- Minimum contrast 4.5:1 (all text passes on dark backgrounds)
- Focus visible outlines (`--border-focus`, 2px offset)
- Keyboard navigable tables and charts
- `prefers-reduced-motion`: disable sparklines/transitions
- Color-blind safe: severity uses shape (icons) + color, never color alone
- ARIA labels on all interactive chart elements

## Motion
- Transitions: `150ms ease` for hovers, `200ms ease-out` for panel open
- Chart animations: `300ms` on load, respect reduced-motion
- No decorative animations; all motion serves data comprehension
