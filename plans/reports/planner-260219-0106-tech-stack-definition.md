# Tech Stack Definition - Report

## Summary

Created two foundational docs defining the MVP tech stack and system architecture for AI Cost Profiler.

## Files Created

- `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/docs/tech-stack.md` (96 lines) - Stack choices, monorepo layout, dependencies, dev tooling
- `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/docs/system-architecture.md` (149 lines) - Components, SDK design, API endpoints, DB schema, viz pipeline

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo tool | Turborepo + pnpm | Caching, workspace support, fast |
| SDK pattern | Client wrapper | Non-invasive; user wraps existing OpenAI/Anthropic client |
| ORM | Drizzle | Lightweight, type-safe, SQL-like (not heavy like Prisma) |
| Viz library | Visx + d3-flame-graph | React-native D3, best flamegraph support |
| UI | shadcn/ui | Copy-paste, no lock-in, Tailwind-based |
| Real-time | SSE | One-way updates sufficient for MVP dashboard |
| DB | PostgreSQL + Redis | JSONB for flexible events, Redis for real-time counters |

## MVP Scope

**Included**: SDK (OpenAI + Anthropic wrappers), event ingestion, cost dashboard, flamegraph, treemap, prompt bloat detection, per-feature/user cost attribution, SSE real-time feed.

**Deferred**: Auth/multi-tenant, billing, proxy mode, custom pricing, E2E tests, CI/CD, deployment.

## Architecture Highlights

- SDK intercepts LLM calls, batches events (100 events or 5s), POSTs to server
- Server validates, enriches with pricing, stores in PG, updates Redis counters, publishes SSE
- Async background job handles prompt bloat detection (token ratio analysis, hash dedup)
- Flamegraph uses hierarchical data: Project > Feature > Endpoint > LLM Call
- Pre-computed cost_aggregates table for fast dashboard queries

## No Unresolved Questions
