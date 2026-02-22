# AI Cost Profiler

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](#license)
[![Tests](https://img.shields.io/badge/Tests-175_passing-brightgreen)]()

## Overview

AI Cost Profiler analyzes token usage, latency, and model selection across your AI workflows to reveal where money is actually being spent. It detects prompt bloat, redundant calls, and inefficient context usage, then maps cost per feature or user action.

**Platform**: TypeScript monorepo (Turborepo + pnpm) | **Backend**: Express + PostgreSQL + Redis | **Frontend**: Next.js 15 + Recharts + d3-flame-graph | **Testing**: Vitest (175 passing tests)

## Key Features

- **🪝 SDK Instrumentation** - Drop-in `profileAI()` wrapper for OpenAI, Anthropic, Gemini clients (Proxy pattern)
- **📊 Real-time Dashboard** - Cost by feature, model, provider with live SSE updates (exponential backoff reconnection)
- **🔥 Flamegraph View** - Hierarchical cost visualization (Provider → Model → Feature)
- **⏱️ Time Series Analysis** - Hourly/daily cost trends with customizable granularity
- **🎯 Prompt Bloat Detection** - Similarity clustering with pgvector embeddings
- **📈 Metrics** - Token tracking (input/output/cached), latency per call, cumulative cost per dimension
- **💾 Export** - CSV/JSON export (max 10K rows, rate limited)
- **🔒 Security** - Parameterized SQL, Zod validation, atomic rate limiting, SSE connection limit (100 max)

## Quick Start

### Prerequisites
- **Node.js 20+** and **pnpm 9+**
- **64-bit OS** (x64 or arm64) — Next.js 15 no longer ships native binaries for 32-bit Windows (win32-ia32)
- **Docker** (for PostgreSQL + Redis)

### Setup

```bash
# Clone and install
git clone https://github.com/yourusername/ai-cost-profiler.git
cd ai-cost-profiler
pnpm install

# Start infrastructure
docker compose up -d

# Setup database
pnpm db:push

# (Optional) Seed demo data (600 events)
pnpm seed

# Start dev servers (backend:3100, frontend:3000)
npx turbo dev
```

Visit http://localhost:3000 to see the dashboard.

## Architecture Overview

```
packages/shared (820 LOC)
└─ Zod schemas, types, pricing data (16 models), cost calculator, ID generator

packages/sdk (736 LOC)
└─ profileAI() wrapper → Proxy pattern for OpenAI/Anthropic/Gemini
   └─ EventBatcher (10 events/5s) → HTTP batch POST to /api/v1/events

apps/server (2578 LOC)
└─ Express API
   ├─ Routes: event ingestion, 8 analytics endpoints, SSE streaming, export
   ├─ Services: event processor, cost breakdown, flamegraph, timeseries
   ├─ Middleware: Zod validation, error handling, atomic rate limiting
   └─ DB: Drizzle ORM + PostgreSQL (events, model_pricing, prompt_embeddings, cost_aggregates)
       └─ Redis: pub/sub fan-out (SSE), atomic rate limiting, real-time counters

apps/web (1517 LOC)
└─ Next.js 14 App Router Dashboard (6 pages)
   ├─ Overview: metrics, pie chart, timeseries
   ├─ Flamegraph: d3-flame-graph (Provider→Model→Feature)
   ├─ Models: cost breakdown table by model
   ├─ Features: cost breakdown table by feature
   ├─ Prompts: similarity analysis + token audit
   └─ Realtime: SSE live event feed (exponential backoff: max 10 retries, cap 30s)
```

**Build order**: shared → sdk → server → web (Turborepo `^build` dependency)

## SDK Usage

Wrap your LLM client to auto-profile all calls:

```typescript
import { profileAI } from '@ai-cost-profiler/sdk';
import OpenAI from 'openai';

const openai = profileAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), {
  serverUrl: 'http://localhost:3100',
  feature: 'chat-summary',  // Tag all calls with this feature
  batchSize: 10,            // Optional: max events per batch
  batchTimeoutMs: 5000,     // Optional: max wait time before sending batch
});

// Calls are automatically captured and sent to server
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Summarize this article...' }],
});
```

Supports OpenAI, Anthropic, and Gemini with streaming + error classification (rate_limit, timeout, server_error, invalid_request).

## Dashboard Pages

| Page | Purpose | Visualizations |
|------|---------|----------------|
| **Overview** | Cost dashboard | Total spend, model pie chart, 24h timeseries |
| **Flamegraph** | Hierarchical view | d3-flame-graph (Provider→Model→Feature hierarchy) |
| **Models** | Model comparison | Sortable table, cost % distribution |
| **Features** | Feature breakdown | Sortable table, cost per feature |
| **Prompts** | Prompt audit | Bloat detection, similarity clustering |
| **Realtime** | Live feed | SSE event stream, cost counter updates |

## API Endpoints

All under `/api/v1/`:

| Method | Endpoint | Purpose | Params |
|--------|----------|---------|--------|
| **POST** | `/events` | Ingest events (batch up to 500) | JSON body |
| **GET** | `/analytics/cost-breakdown` | Cost by feature/model | `from`, `to`, `groupBy` |
| **GET** | `/analytics/flamegraph` | Hierarchical cost | `from`, `to` |
| **GET** | `/analytics/timeseries` | Time series data | `from`, `to`, `granularity` (hour/day/week) |
| **GET** | `/analytics/prompts` | Prompt analysis | `from`, `to` |
| **GET** | `/analytics/realtime-totals` | Redis-backed totals | None |
| **GET** | `/stream/costs` | SSE live stream | None |
| **GET** | `/export/events` | CSV/JSON export (max 10K rows) | `format`, `from`, `to`, `feature`, `model` |

## Environment Variables

### Server (`apps/server/.env`)
```bash
DATABASE_URL=postgresql://profiler:profiler_dev@localhost:5432/ai_cost_profiler
REDIS_URL=redis://localhost:6379
PORT=3100
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
```

### Web (`apps/web/.env.local`)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3100
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install all workspace dependencies |
| `npx turbo build` | Build all packages (shared → sdk → server → web) |
| `npx turbo dev` | Start dev servers (server:3100, web:3000) |
| `npx turbo test` | Run all tests (175 total) |
| `npx turbo lint` | Lint all packages |
| `pnpm db:push` | Push Drizzle schema to PostgreSQL |
| `pnpm seed` | Seed 600 demo events + sync Redis counters |
| `pnpm test:smoke` | SDK → Server integration smoke test |
| `docker compose up -d` | Start PostgreSQL + Redis |

## Tech Stack

**Monorepo**: Turborepo 2.0 + pnpm 9.0
**Language**: TypeScript 5.4 (ESM only)
**Runtime**: Node.js 20+

**Backend**: Express 4, Drizzle ORM, PostgreSQL 16 (pgvector), Redis 7, Zod validation, Pino logging
**Frontend**: Next.js 14 (App Router), shadcn/ui, Tailwind CSS, TanStack Query v5, Recharts, Visx, d3-flame-graph
**Testing**: Vitest 4.0, supertest
**Database**: PostgreSQL with pgvector extension for prompt similarity
**Real-time**: Server-Sent Events (SSE) via Redis pub/sub

## Project Metrics

- **Total LOC**: 8,322 TypeScript (5,867 source + 1,660 tests)
- **Test Coverage**: 175 passing tests across shared/sdk/server
- **Supported Models**: 16 (6 OpenAI + 4 Anthropic + 6 Gemini)
- **Providers**: 3 (openai, anthropic, google-gemini)
- **Database Tables**: 5 (events, model_pricing, prompt_embeddings, cost_aggregates, + system tables)
- **API Routes**: 8 public endpoints

## Key Design Patterns

1. **Proxy Pattern** - SDK uses JavaScript Proxies to intercept LLM client calls transparently
2. **Batch Processing** - EventBatcher buffers events (default 10/5s, max 1000 buffer)
3. **SQL Safety** - All `sql.raw()` whitelist-guarded (GRANULARITY_VALUES for DATE_TRUNC)
4. **Cursor Pagination** - Composite (timestamp, id) instead of OFFSET for stability
5. **Atomic Operations** - Redis MULTI pipeline for rate limiting (no TOCTOU race)
6. **SSE Snapshot** - On connect, server sends `{type: 'snapshot', totalCost}` from Redis
7. **Error Classification** - Shared `classifyApiError()` for rate_limit, timeout, server_error, invalid_request
8. **Service Modularity** - Analytics split into 3 focused services with backward-compatible re-exports

## Security Features

✅ **Parameterized SQL** - All Drizzle queries prevent SQL injection
✅ **Input Validation** - Zod schemas on all API endpoints
✅ **Helmet Middleware** - Security headers configured
✅ **Rate Limiting** - Atomic Redis pipeline, fixed-window (no orphaned keys)
✅ **SSE Limits** - Max 100 concurrent connections (503 if exceeded)
✅ **Export Limits** - Max 10,000 rows per request
✅ **CORS** - Configurable via `CORS_ORIGIN` env
✅ **Error Messages** - Safe error responses (no stack leaks)

## Performance

- **SDK overhead**: < 1ms per call (batched, non-blocking)
- **Event batching**: 10 events or 5s interval (reduces HTTP by 10x)
- **SSE latency**: < 100ms broadcast time (Redis pub/sub)
- **API response**: < 200ms p95 (indexed queries)
- **Frontend cache**: 5min TanStack Query stale time

## Status

**v1.0** Complete (2026-02-19)
- ✅ MVP fully implemented (SDK, API, Dashboard)
- ✅ All security issues fixed (code review 8/10)
- ✅ 175 tests passing
- ✅ Production-ready build

## Contributing

1. Read [./docs/code-standards.md](./docs/code-standards.md) for conventions
2. See [./docs/system-architecture.md](./docs/system-architecture.md) for architecture
3. Check [./docs/project-roadmap.md](./docs/project-roadmap.md) for upcoming work

## License

MIT - See LICENSE file for details
