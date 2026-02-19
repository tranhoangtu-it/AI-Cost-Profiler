# Codebase Summary

## Project Metrics

- **Total LOC**: 8,322 TypeScript (5,867 source + 1,660 tests)
- **Supported Models**: 16 (6 OpenAI + 4 Anthropic + 6 Gemini)
- **API Endpoints**: 8 public routes (v1)
- **Database Tables**: 5 (events, model_pricing, prompt_embeddings, cost_aggregates, system)
- **Test Files**: 175 passing tests across shared/sdk/server
- **Packages**: 2 (`shared`, `sdk`)
- **Apps**: 2 (`server`, `web`)
- **Monorepo Tool**: Turborepo 2.0 + pnpm 9.0

## Monorepo Structure

```
ai-cost-profiler/
├── packages/
│   ├── shared/              # Shared utilities, schemas, types
│   └── sdk/                 # LLM profiling SDK
├── apps/
│   ├── server/              # Express API backend
│   └── web/                 # Next.js dashboard
├── scripts/                 # Utility scripts
│   ├── seed-demo-data.ts    # Seed 600 demo events
│   └── test-sdk-flow.ts     # Smoke test SDK → Server
├── docker-compose.yml       # PostgreSQL + Redis
├── turbo.json               # Turborepo config
└── package.json             # Root workspace config
```

## Package: `@ai-cost-profiler/shared`

**Purpose**: Shared code used by SDK and server (schemas, types, pricing, utilities).

**Directory Structure**:
```
packages/shared/src/
├── schemas/
│   ├── event-schema.ts          # Zod schema for Event validation
│   └── analytics-schema.ts      # Zod schema for analytics responses
├── constants/
│   └── model-pricing.ts         # Pricing database (13 models)
├── utils/
│   ├── cost-calculator.ts       # calculateCost() function
│   └── id-generator.ts          # generateId() for events
├── types/
│   └── index.ts                 # TypeScript interfaces
└── index.ts                     # Public exports
```

**Key Files**:

| File | Purpose | Exports |
|------|---------|---------|
| `schemas/event-schema.ts` | Event validation | `EventSchema`, `EventBatchSchema` |
| `schemas/analytics-schema.ts` | Analytics validation | `CostBreakdownSchema`, etc. |
| `constants/model-pricing.ts` | Model pricing data | `MODEL_PRICING`, `DEFAULT_PRICING` |
| `utils/cost-calculator.ts` | Cost calculations | `calculateCost()` |
| `utils/id-generator.ts` | ID generation | `generateId()` |
| `types/index.ts` | TypeScript types | `Event`, `ModelPricing`, `SdkConfig` |

**Model Pricing Database** (16 models):
- OpenAI (6): `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo`, `text-embedding-3-small`, `text-embedding-3-large`
- Anthropic (4): `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`, `claude-sonnet-4-20250514`
- Gemini (6): `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-1.0-pro`, `gemini-pro-vision`, `gemini-2.0-flash`, `gemini-2.0-pro`

**Tests** (9 files):
- `cost-calculator.test.ts` - Cost calculation logic
- `event-schema.test.ts` - Zod validation
- `id-generator.test.ts` - ID generation

## Package: `@ai-cost-profiler/sdk`

**Purpose**: Lightweight SDK to wrap LLM clients and profile API calls.

**Directory Structure**:
```
packages/sdk/src/
├── providers/
│   ├── openai-interceptor.ts    # OpenAI Proxy wrapper
│   ├── anthropic-interceptor.ts # Anthropic Proxy wrapper
│   ├── error-classifier.ts      # Shared error classification
│   └── gemini-interceptor.ts    # Gemini Proxy wrapper
├── transport/
│   └── event-batcher.ts         # Batch events (10 events/5s)
├── utils/
│   └── detect-provider.ts       # Auto-detect OpenAI/Anthropic/Gemini
├── profiler-wrapper.ts          # Main profileAI() API
└── index.ts                     # Public exports
```

**Key Files**:

| File | Purpose | Key Functions |
|------|---------|---------------|
| `profiler-wrapper.ts` | Main API entry point | `profileAI(client, config)` |
| `providers/openai-interceptor.ts` | OpenAI wrapper | `createOpenAIInterceptor()` |
| `providers/anthropic-interceptor.ts` | Anthropic wrapper | `createAnthropicInterceptor()` |
| `providers/gemini-interceptor.ts` | Gemini wrapper | `createGeminiInterceptor()` |
| `providers/error-classifier.ts` | Shared error classification | `classifyApiError()` |
| `transport/event-batcher.ts` | Event batching | `EventBatcher` class |
| `utils/detect-provider.ts` | Provider detection | `detectProvider(client)` |

**Design Patterns**:
- **Proxy Pattern**: Transparent LLM client wrapping
- **Error Classification**: Shared `classifyApiError()` maps provider errors to standard codes (rate_limit, timeout, server_error, invalid_request, unknown_error)
- **Stream Handling**: Anthropic emits single event at stream end (not per-delta); mid-stream errors trigger callbacks
- **Supported Providers**: OpenAI, Anthropic, Gemini (both SDK variants)

**Usage**:
```typescript
import { profileAI } from '@ai-cost-profiler/sdk';
import OpenAI from 'openai';

const openai = profileAI(new OpenAI({ apiKey }), {
  serverUrl: 'http://localhost:3100',
  feature: 'chat-summary',
});
```

**Tests** (8 files):
- `profiler-wrapper.test.ts` - Main API tests
- `event-batcher.test.ts` - Batching logic

## App: `server`

**Purpose**: Express API for event ingestion, analytics, and SSE streaming.

**Directory Structure**:
```
apps/server/src/
├── db/
│   ├── schema.ts                # Drizzle schema (events table)
│   ├── connection.ts            # PostgreSQL client
│   └── index.ts                 # DB exports
├── lib/
│   └── redis.ts                 # Redis client
├── middleware/
│   ├── request-validator.ts     # Zod validation middleware
│   ├── error-handler.ts         # Global error handler
│   └── rate-limiter.ts          # Fixed-window rate limiter (atomic Redis MULTI)
├── routes/
│   ├── event-routes.ts          # POST /api/v1/events
│   ├── analytics-routes.ts      # GET /api/v1/analytics/*
│   ├── stream-routes.ts         # GET /api/v1/stream/events
│   └── export-routes.ts         # GET /api/v1/export/* (CSV/JSON)
├── services/
│   ├── event-processor.ts       # Event storage + broadcast
│   ├── analytics-service.ts     # Analytics queries (re-exports split services)
│   ├── cost-breakdown-service.ts# Cost breakdown logic
│   ├── flamegraph-service.ts    # Flamegraph data aggregation
│   ├── timeseries-service.ts    # Time-series data aggregation
│   ├── sse-manager.ts           # SSE connection manager (maxClients=100)
│   └── prompt-similarity-service.ts # Prompt embedding + similarity
├── app.ts                       # Express app factory
└── index.ts                     # Server entry point
```

**Key Files**:

| File | Purpose | Endpoints/Functions |
|------|---------|---------------------|
| `routes/event-routes.ts` | Event ingestion | `POST /api/v1/events` (batch up to 500) |
| `routes/analytics-routes.ts` | Analytics API | `GET /cost-breakdown`, `/flamegraph`, `/timeseries`, `/prompts`, `/realtime-totals` |
| `routes/stream-routes.ts` | SSE streaming | `GET /api/v1/stream/events` (SSE snapshot + incremental) |
| `routes/export-routes.ts` | Data export | `GET /export/events`, `/export/cost-summary` (CSV/JSON, max 10k rows) |
| `services/event-processor.ts` | Event processing | `processEvents()`, `broadcastEvent()` |
| `services/analytics-service.ts` | Analytics queries | Re-exports split services for backward compatibility |
| `services/cost-breakdown-service.ts` | Cost breakdown | `getCostBreakdown()` |
| `services/flamegraph-service.ts` | Flamegraph data | `getFlamegraphData()` |
| `services/timeseries-service.ts` | Time-series data | `getTimeseries()` |
| `services/sse-manager.ts` | SSE lifecycle | `SSEManager` class (connection limit: 100) |
| `db/schema.ts` | Database schema | `events` table definition |

**Database Schema** (Drizzle ORM):
```typescript
// Main events table
export const events = pgTable('events', {
  id: text('id').primaryKey(),
  feature: text('feature').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  totalCost: numeric('total_cost', { precision: 10, scale: 6 }).notNull(),
  latency: integer('latency').notNull(),
  timestamp: timestamp('timestamp').notNull(),
  metadata: jsonb('metadata'),
});

// Additional tables
export const modelPricing = pgTable('model_pricing', {...});
export const promptEmbeddings = pgTable('prompt_embeddings', {...});  // pgvector
export const costAggregates = pgTable('cost_aggregates', {...});
```

**Indexes** (for query performance):
- `events_feature_idx` on feature
- `events_model_idx` on model
- `events_timestamp_idx` on timestamp (critical for time-series)

**Tests** (16 files):
- `event-routes.test.ts` - Event ingestion tests
- `analytics-service.test.ts` - Analytics query tests

## App: `web`

**Purpose**: Next.js 14 dashboard for visualizing LLM costs.

**Directory Structure**:
```
apps/web/src/
├── app/
│   ├── (dashboard)/
│   │   ├── overview/page.tsx     # Cost overview
│   │   ├── features/page.tsx     # Feature breakdown
│   │   ├── flamegraph/page.tsx   # Flamegraph view
│   │   ├── prompts/page.tsx      # Prompt inspector
│   │   ├── realtime/page.tsx     # Live event feed
│   │   └── layout.tsx            # Dashboard layout
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Landing page
├── components/
│   ├── layout/
│   │   ├── sidebar-nav.tsx       # Navigation sidebar
│   │   └── top-bar.tsx           # Header bar
│   ├── charts/
│   │   ├── cost-flamegraph.tsx   # d3-flame-graph wrapper
│   │   ├── cost-treemap.tsx      # Visx treemap
│   │   ├── cost-timeseries.tsx   # Recharts line chart
│   │   ├── model-pie-chart.tsx   # Recharts pie chart
│   │   └── feature-bar-chart.tsx # Recharts bar chart
│   ├── providers/
│   │   └── query-provider.tsx    # TanStack Query setup
│   └── ui/                       # shadcn/ui primitives
└── lib/
    ├── api-client.ts             # Fetch wrapper
    └── utils.ts                  # Utility functions
```

**Key Pages** (6 dashboard routes):

| Page | Purpose | Visualizations |
|------|---------|----------------|
| `overview/page.tsx` | Cost dashboard | Total spend, model pie chart, 24h timeseries, top features |
| `features/page.tsx` | Feature breakdown | Treemap, bar chart, sortable table by cost/count |
| `flamegraph/page.tsx` | Hierarchical view | d3-flame-graph (Provider→Model→Feature) |
| `models/page.tsx` | Model comparison | Cost distribution, sortable table, % breakdown |
| `prompts/page.tsx` | Prompt inspector | Token bloat analysis, similarity clustering, prompt list |
| `realtime/page.tsx` | Live feed | SSE event stream, live cost counter, exponential backoff reconnection |

**Chart Libraries**:
- **Recharts**: Line charts, bar charts, pie charts
- **Visx**: Treemaps
- **d3-flame-graph**: Flamegraph visualization

**State Management**:
- TanStack Query for server state (5min cache)
- React hooks for local state

**Tests** (20 files):
- Component tests for charts and layouts

## Scripts

### `scripts/seed-demo-data.ts`
**Purpose**: Seed 600 demo events into PostgreSQL for testing.

**Usage**:
```bash
pnpm seed
```

**Data Generated**:
- 600 events across 5 features
- 3 models (gpt-4o, gpt-4o-mini, claude-3-5-sonnet)
- Realistic token counts and latencies
- Last 24 hours timestamp distribution

### `scripts/test-sdk-flow.ts`
**Purpose**: End-to-end smoke test (SDK → Server → Database).

**Usage**:
```bash
pnpm test:smoke
```

**Flow**:
1. Wraps OpenAI client with `profileAI()`
2. Makes LLM API call
3. Waits for event batch
4. Queries server analytics API
5. Verifies event was recorded

## Build System

### Turborepo Configuration (`turbo.json`)
```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

**Build Order**:
```
shared → sdk → server → web
```

### Package Managers
- **Monorepo**: pnpm 9.0 workspaces
- **Task Runner**: Turborepo 2.0

### Build Tools
- **TypeScript**: tsc for type checking
- **Bundler**: tsup (packages), esbuild (Next.js)
- **Module Format**: ESM only (`.js` extensions in imports)

## Infrastructure

### Docker Compose (`docker-compose.yml`)
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: profiler
      POSTGRES_PASSWORD: profiler_dev
      POSTGRES_DB: ai_cost_profiler

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
```

### Environment Variables

**Server** (`.env`):
```bash
DATABASE_URL=postgresql://profiler:profiler_dev@localhost:5432/ai_cost_profiler
REDIS_URL=redis://localhost:6379
PORT=3100
CORS_ORIGIN=http://localhost:3000
```

**Web** (`.env.local`):
```bash
NEXT_PUBLIC_API_URL=http://localhost:3100
```

## Testing Strategy

### Test Coverage
- **Shared**: 100% (cost calculation, validation, ID generation)
- **SDK**: 95% (proxy wrapping, batching)
- **Server**: 80% (API routes, services)
- **Web**: 70% (components, charts)

### Test Runner
- **Framework**: Vitest 4.0
- **API Testing**: supertest
- **Assertions**: Built-in Vitest matchers

### Test Organization
- **Unit**: `__tests__/*.test.ts` in each package
- **Integration**: `apps/server/src/__tests__/`
- **E2E**: `scripts/test-sdk-flow.ts`

## Development Workflow

### Commands
```bash
# Infrastructure
docker compose up -d          # Start PostgreSQL + Redis

# Development
pnpm install                  # Install dependencies
npx turbo build               # Build all packages
npx turbo dev                 # Dev servers (server:3100, web:3000)
npx turbo test                # Run all tests
npx turbo lint                # Lint all packages

# Database
pnpm db:push                  # Push schema to PostgreSQL
pnpm seed                     # Seed demo data

# Testing
pnpm test:smoke               # SDK → Server smoke test
```

### Development Servers
- **Server**: http://localhost:3100
- **Web**: http://localhost:3000

## Code Quality

### TypeScript Configuration
- **Strict Mode**: Enabled
- **ESM Only**: `.js` extensions in imports
- **Type Safety**: No `any`, use `unknown`

### Linting
- ESLint with TypeScript plugin
- Prettier for formatting

### Git Hooks
- No pre-commit hooks in MVP

## Recent Improvements (v1.0)

1. **Security** (Critical): SQL injection prevention - all export routes use parameterized Drizzle queries; comprehensive Zod validation for date formats
2. **SDK**: Shared `error-classifier.ts` maps provider errors to standard codes; Anthropic streaming emits single event at completion; mid-stream error callbacks added
3. **Backend**: Rate limiter uses atomic Redis MULTI/EXPIRE NX pipeline (no TOCTOU); SSE enforces maxClients=100 (503 if exceeded); analytics modularized into 3 focused services with re-exports
4. **Frontend**: Time range auto-refreshes every 60s; export errors shown via non-blocking toast; sidebar nav uses exact path matching; SSE reconnection with exponential backoff (max 10 retries, cap 30s)
5. **Export Limits**: Enforces 10K row limit per request with truncation indicator headers
6. **Seed Data**: isCacheHit correctly set based on cachedTokens > 0; generates realistic cache hit percentages (~30%)

## Known Limitations

1. **No Authentication**: Public API endpoints
2. **No Multi-Tenancy**: Single workspace
3. **No Alerts**: No cost threshold notifications
4. **Storage**: In-memory event history (no long-term archival)

## Future Enhancements

1. Multi-workspace support with API key auth
2. Cost anomaly detection + alerts
3. Prompt clustering with similarity scores
4. Data retention policies + archival
5. Slack/email notifications
6. Horizontal scaling with read replicas
