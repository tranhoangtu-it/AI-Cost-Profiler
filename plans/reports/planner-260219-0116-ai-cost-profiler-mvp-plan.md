# Planner Report: AI Cost Profiler MVP Implementation Plan

**Date:** 2026-02-19 | **Plan dir:** `plans/260219-0107-ai-cost-profiler-mvp/`

## Summary

Created a 6-wave, parallel-optimized implementation plan for the AI Cost Profiler MVP monorepo. 10 files total: 1 overview + 9 phase files.

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `plan.md` | Overview, dependency graph, file ownership matrix | ~78 |
| `phase-01-monorepo-foundation.md` | Turborepo + pnpm + Docker Compose + configs | ~180 |
| `phase-02a-shared-package.md` | Zod schemas, types, pricing constants, utils | ~200 |
| `phase-02b-database-schema.md` | Drizzle schema (4 tables), connection, migration | ~150 |
| `phase-03a-sdk-package.md` | profileAI() wrapper, interceptors, event batcher | ~230 |
| `phase-03b-backend-api.md` | Express API (6 endpoints), event pipeline, SSE | ~300 |
| `phase-04a-dashboard-layout.md` | Next.js 14 setup, shadcn/ui, sidebar, components | ~280 |
| `phase-04b-visualization-views.md` | 5 pages: overview, features, flamegraph, prompts, realtime | ~350 |
| `phase-05-integration-wiring.md` | Seed script, smoke test, end-to-end wiring | ~180 |
| `phase-06-testing.md` | Vitest unit + integration tests across all packages | ~280 |

## Parallel Execution Strategy

```
Wave 1: Phase 1 (Foundation)                    ~3h
Wave 2: Phase 2a + 2b (Parallel)                ~3h
Wave 3: Phase 3a + 3b (Parallel)                ~6h
Wave 4: Phase 4a, then 4b (Sequential)          ~8h
Wave 5: Phase 5 (Integration)                   ~4h
Wave 6: Phase 6 (Testing)                       ~4h
                                        Total: ~28h wall-clock (32h effort)
```

## Key Design Decisions

1. **Proxy pattern for SDK** - wraps OpenAI/Anthropic clients via JS Proxy; transparent to consumers
2. **Recharts for simple charts, Visx for treemap, d3-flame-graph for flamegraph** - right tool per viz complexity
3. **SSE over WebSocket** - simpler, sufficient for 1-5s refresh dashboard updates
4. **Zod schemas in shared package** - single source of truth validated at both SDK emit and server ingest
5. **Redis for real-time counters + SSE pub/sub** - decouples event ingestion from dashboard streaming
6. **Exclusive file ownership per phase** - zero merge conflicts in parallel execution

## Critical Path

Phase 1 -> Phase 2a -> Phase 3a/3b -> Phase 4a -> Phase 4b -> Phase 5 -> Phase 6

Phase 2b runs parallel with 2a but is NOT on critical path (only blocks 3b).

## No Unresolved Questions

All architectural decisions made. Implementation can proceed.
