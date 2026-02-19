# Design Guidelines & Wireframes Report

## Deliverables

### 1. Design Guidelines (`docs/design-guidelines.md` - 137 lines)
- **Dark theme** palette: 4 background tiers (`#0a0a0f` to `#23232f`), 3 text tiers
- **Cost severity** semantic colors: green (low), yellow (medium), red (high/critical)
- **Typography**: JetBrains Mono for metrics, Inter for labels; 8-level type scale
- **Layout**: 12-col CSS Grid, 4 responsive breakpoints (320px to 1440px+)
- **Component patterns**: metric card, data table, chart container, flamegraph bar, status indicator, sidebar nav
- **shadcn/ui mapping**: Card, Table, Sidebar, Badge, Tooltip, Recharts
- **Accessibility**: WCAG 2.1 AA contrast, focus rings, reduced-motion support, color-blind safe severity (shape + color)
- **Motion**: functional only, 150-300ms transitions

### 2. Dashboard Wireframe (`docs/wireframes/dashboard.html` - 179 lines)
- **Top**: 4 summary metric cards (total cost, tokens, avg latency, cache hit rate) with sparklines and trend arrows
- **Middle**: cost-over-time bar chart (2fr) + model distribution pie chart (1fr)
- **Bottom**: top expensive features table with cost badges (high/medium/low)
- Responsive: 4-col > 2-col > 1-col

### 3. Flamegraph Wireframe (`docs/wireframes/flamegraph.html` - 183 lines)
- **Breadcrumb** navigation for drill-down context
- **4-level flamegraph**: Root > Feature > Endpoint > Model, bar width = cost proportion
- **Color intensity** maps to cost severity (red=high, yellow=medium, green=low)
- **Details panel**: cost, requests, tokens in/out, latency (P50/P95), cache hit rate, optimization suggestion

### 4. Prompt Analysis Wireframe (`docs/wireframes/prompt-analysis.html` - 194 lines)
- **Stats row**: prompts analyzed, avg bloat score, estimated waste
- **Prompt list**: name, endpoint, token count, cost, similarity score badge, bloat bar indicator
- **Context size trend**: 7-day bar chart showing token growth
- **Redundant context detection**: code block with highlighted redundant lines (red) vs unique (dimmed)

## Design Decisions
- **Grafana/Datadog aesthetic**: data-dense, dark, monospace numerics for scanability
- **Cost severity** as primary visual language: users immediately spot expensive items
- **Flamegraph metaphor**: familiar to developers (from CPU profiling), maps naturally to feature > endpoint > model hierarchy
- **Prompt bloat as similarity score**: quantifies redundancy across prompts, actionable for optimization
- **Shared sidebar nav**: consistent across all 3 views, collapsible on mobile
- **CSS-only wireframes**: no JS dependencies, fast to review, easy to open in any browser

## File Summary
| File | Path | Lines |
|------|------|-------|
| Design Guidelines | `docs/design-guidelines.md` | 137 |
| Dashboard | `docs/wireframes/dashboard.html` | 179 |
| Flamegraph | `docs/wireframes/flamegraph.html` | 183 |
| Prompt Analysis | `docs/wireframes/prompt-analysis.html` | 194 |
