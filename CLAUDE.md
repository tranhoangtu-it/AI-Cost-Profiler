# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Cost Profiler - LLM cost analysis tool. TypeScript monorepo (Turborepo + pnpm). Tracks token usage, latency, and cost across OpenAI/Anthropic/Gemini, visualizes as flamegraphs, treemaps, and time series.

## Architecture

```
packages/shared     → Zod schemas, types, model pricing (16 models), cost calculator, ID generator
packages/sdk        → profileAI() wrapper for OpenAI/Anthropic/Gemini (Proxy pattern), EventBatcher
apps/server         → Express API: event ingestion, analytics, SSE streaming (PostgreSQL + Redis + Drizzle)
apps/web            → Next.js 14 App Router dashboard: Recharts, Visx treemap, d3-flame-graph
```

Build order: `shared → sdk → server → web` (Turborepo handles via `^build` dependency).

## Commands

```bash
docker compose up -d          # PostgreSQL (pgvector:pg16) + Redis
pnpm install                  # Install all workspace deps
npx turbo build               # Build all packages in order
npx turbo dev                 # Dev servers (server:3100, web:3000)
npx turbo test                # Run Vitest across shared/sdk/server
npx turbo lint                # Lint all packages
pnpm seed                     # Seed 600 demo events + sync Redis counters
pnpm test:smoke               # SDK → Server integration smoke test
pnpm db:push                  # Push Drizzle schema to PostgreSQL
```

Single package test: `cd packages/shared && npx vitest run`

## Database

- PostgreSQL with pgvector extension (for prompt similarity search)
- Drizzle ORM for schema/queries (`apps/server/src/db/`)
- Tables: `events`, `model_pricing`, `prompt_analysis`, `cost_aggregates`
- Redis: real-time counters (`realtime:total_cost`, `realtime:total_requests`, `realtime:total_tokens`), SSE pub/sub channel

## API Routes

All routes under `/api/v1/`:
- `POST /events` - Ingest profiling events (from SDK)
- `GET /analytics/cost-breakdown?from=&to=&groupBy=` - Cost by dimension
- `GET /analytics/timeseries?from=&to=&granularity=` - Cost over time (granularity required)
- `GET /analytics/flamegraph?from=&to=` - Hierarchical cost data (no granularity)
- `GET /analytics/prompts?from=&to=` - Prompt bloat analysis (no granularity)
- `GET /analytics/realtime-totals` - Redis-backed totals (no params)
- `GET /stream/costs` - SSE endpoint for real-time updates

## Key Patterns

- **Pricing**: Per 1M tokens (`inputPer1M`/`outputPer1M`), NOT per 1K
- **Provider enum**: `'openai' | 'anthropic' | 'google-gemini'`
- **Schema split**: `baseTimeRangeSchema` (from/to) vs `timeRangeSchema` (adds granularity). Flamegraph/prompts/cost-breakdown use base; timeseries uses full.
- **SQL safety**: All `sql.raw()` in Drizzle is whitelist-guarded (e.g., `GRANULARITY_VALUES` for DATE_TRUNC)
- **Server factory**: `createApp()` in `apps/server/src/app.ts` (not exported `app` instance)
- **SSE snapshot**: On connect, server sends `{ type: 'snapshot', totalCost }` from Redis
- **Frontend queries**: Use `useTimeRange()` hook (memoized, rounded to minute) for stable React Query keys
- **Format utils**: `formatCost()`, `formatTokens()`, `formatLatency()` in `apps/web/src/lib/utils.ts` all handle null/undefined

## Environment

Required env vars (see `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `NEXT_PUBLIC_API_URL` - Server URL for frontend (default: `http://localhost:3100`)

## Testing

- Vitest workspace: `packages/shared`, `packages/sdk`, `apps/server`
- Frontend (apps/web) has no test suite yet
- Config: `vitest.workspace.ts` at root
