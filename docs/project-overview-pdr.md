# AI Cost Profiler - Product Overview & Requirements

## Product Summary

AI Cost Profiler analyzes token usage, latency, and model selection across AI workflows to reveal where money is actually being spent. It detects prompt bloat, redundant calls, and inefficient context usage, then maps cost per feature or user action.

## MVP Status

**Complete** - All core functionality implemented and tested (151 test files, 102 passing tests).

## Architecture

**TypeScript Monorepo** (Turborepo + pnpm workspaces)
- `packages/shared` - Shared schemas, types, pricing data, utilities
- `packages/sdk` - LLM wrapper SDK for profiling
- `apps/server` - Express API backend
- `apps/web` - Next.js 14 dashboard

## Tech Stack

### Build System
- **Monorepo**: Turborepo 2.0 + pnpm 9.0 workspaces
- **Language**: TypeScript 5.4 (ESM only)
- **Node**: >= 20

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express 4
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL 16 with pgvector extension
- **Cache**: Redis 7
- **Validation**: Zod schemas
- **Logging**: Pino

### Frontend
- **Framework**: Next.js 14 App Router
- **UI**: shadcn/ui + Tailwind CSS
- **State**: TanStack Query v5
- **Charts**: Recharts, Visx, d3-flame-graph
- **Real-time**: Server-Sent Events (SSE)

### Testing
- **Runner**: Vitest 4.0
- **Coverage**: Unit tests across all packages

## Core Features

### 1. LLM Call Profiling (SDK)
**Module**: `@ai-cost-profiler/sdk`

**Functionality**:
- Wraps OpenAI and Anthropic clients using Proxy pattern
- Auto-detects provider from client instance
- Captures: model, tokens, latency, cost, feature context
- Batches events (default 10 events or 5s interval)
- Zero config beyond `profileAI(client, config)`

**Supported Providers**:
- OpenAI (official SDK)
- Anthropic (official SDK)

**Pricing Database**: 13 models (6 OpenAI, 4 Anthropic, 3 Gemini) with per-token costs

### 2. Event Ingestion (Server)
**Endpoint**: `POST /api/v1/events`

**Functionality**:
- Validates events via Zod schema
- Stores in PostgreSQL with Drizzle ORM
- Broadcasts to SSE clients via Redis pub/sub
- Request validation middleware

### 3. Analytics API (Server)
**Endpoints**:
- `GET /api/v1/analytics/cost-breakdown` - Cost by feature/model
- `GET /api/v1/analytics/flamegraph` - Hierarchical cost tree
- `GET /api/v1/analytics/timeseries` - Cost over time (hourly/daily)
- `GET /api/v1/analytics/prompts` - Prompt clustering & analysis

**Analytics**:
- Aggregations: SUM, AVG, COUNT by feature/model
- Time-series: Hourly and daily rollups
- Prompt similarity: pgvector cosine similarity (not yet implemented in MVP)

### 4. Real-time Streaming (Server)
**Endpoint**: `GET /api/v1/stream/events`

**Functionality**:
- SSE stream of live events
- Redis pub/sub for multi-instance support
- Auto-reconnect on client disconnect

### 5. Dashboard (Web)
**Pages**:
- `/overview` - Total spend, top features, model distribution
- `/features` - Cost breakdown by feature
- `/flamegraph` - Interactive hierarchical cost visualization
- `/prompts` - Prompt inspection & similarity analysis
- `/realtime` - Live event feed

**Visualizations**:
- Recharts: Bar charts, line charts, pie charts
- Visx: Treemaps
- d3-flame-graph: Flamegraph widget

## Data Model

### Events Table (PostgreSQL)
```typescript
{
  id: text (primary key),
  feature: text,
  model: text,
  inputTokens: integer,
  outputTokens: integer,
  totalCost: numeric,
  latency: integer,
  timestamp: timestamp,
  metadata: jsonb
}
```

### Model Pricing (In-Memory)
```typescript
{
  model: string,
  provider: 'openai' | 'anthropic' | 'google-gemini',
  inputPer1M: number,
  outputPer1M: number,
  cachedInputPer1M?: number
}
```

## Non-Functional Requirements

### Performance
- Event batching: Max 10 events or 5s interval
- SSE: < 100ms broadcast latency
- API: < 200ms p95 response time

### Scalability
- Horizontal: Redis pub/sub for multi-instance SSE
- Database: Indexed on `feature`, `model`, `timestamp`

### Security
- Helmet middleware for security headers
- CORS configurable via env
- No authentication (MVP)

### Observability
- Structured logging with Pino
- Health check: `GET /health`

## Commands

```bash
# Infrastructure
docker compose up -d          # PostgreSQL + Redis

# Development
pnpm install                  # Install dependencies
npx turbo build               # Build all packages (shared → sdk → server → web)
npx turbo dev                 # Run dev servers (server:3100, web:3000)
npx turbo test                # Run all tests
npx turbo lint                # Lint all packages

# Database
pnpm db:push                  # Push schema to PostgreSQL
pnpm seed                     # Seed 600 demo events

# Testing
pnpm test:smoke               # SDK → Server integration test
```

## Environment Variables

### Server (`apps/server/.env`)
```bash
DATABASE_URL=postgresql://profiler:profiler_dev@localhost:5432/ai_cost_profiler
REDIS_URL=redis://localhost:6379
PORT=3100
CORS_ORIGIN=http://localhost:3000
```

### Web (`apps/web/.env.local`)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3100
```

## Known Limitations (MVP)

1. **No Authentication**: Public API endpoints
2. **No Prompt Similarity**: pgvector embeddings not implemented
3. **No Multi-Tenancy**: Single workspace
4. **Provider Support**: OpenAI + Anthropic only (no Gemini SDK wrapper)
5. **No Alerts**: No cost threshold notifications

## Success Metrics

- **Developer Integration**: < 5 minutes to instrument codebase
- **Event Throughput**: 1000 events/sec sustained
- **Dashboard Load**: < 2s initial render
- **Test Coverage**: 100% for shared/sdk, 80% for server/web

## Future Roadmap

1. Gemini SDK wrapper implementation
2. Prompt embeddings + similarity clustering
3. Cost anomaly detection
4. Multi-workspace support
5. Slack/email alerts
6. Export to CSV/Parquet
