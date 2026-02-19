# Codebase Summary

## Project Metrics

- **Total TypeScript Files**: 60 (24 in packages, 16 in server, 20 in web)
- **Test Files**: 151 (102 passing tests)
- **Packages**: 2 (`shared`, `sdk`)
- **Apps**: 2 (`server`, `web`)
- **Lines of Code**: ~4,000 (excluding tests, configs)

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

**Model Pricing Database** (13 models):
- OpenAI: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo`, `text-embedding-3-small`, `text-embedding-3-large`
- Anthropic: `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`, `claude-sonnet-4-20250514`
- Gemini: `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-1.0-pro`

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
│   └── anthropic-interceptor.ts # Anthropic Proxy wrapper
├── transport/
│   └── event-batcher.ts         # Batch events (10 events/5s)
├── utils/
│   └── detect-provider.ts       # Auto-detect OpenAI/Anthropic
├── profiler-wrapper.ts          # Main profileAI() API
└── index.ts                     # Public exports
```

**Key Files**:

| File | Purpose | Key Functions |
|------|---------|---------------|
| `profiler-wrapper.ts` | Main API entry point | `profileAI(client, config)` |
| `providers/openai-interceptor.ts` | OpenAI wrapper | `createOpenAIInterceptor()` |
| `providers/anthropic-interceptor.ts` | Anthropic wrapper | `createAnthropicInterceptor()` |
| `transport/event-batcher.ts` | Event batching | `EventBatcher` class |
| `utils/detect-provider.ts` | Provider detection | `detectProvider(client)` |

**Design Pattern**: Proxy pattern for transparent client wrapping.

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
│   └── error-handler.ts         # Global error handler
├── routes/
│   ├── event-routes.ts          # POST /api/v1/events
│   ├── analytics-routes.ts      # GET /api/v1/analytics/*
│   └── stream-routes.ts         # GET /api/v1/stream/events
├── services/
│   ├── event-processor.ts       # Event storage + broadcast
│   ├── analytics-service.ts     # Analytics queries
│   └── sse-manager.ts           # SSE connection manager
├── app.ts                       # Express app factory
└── index.ts                     # Server entry point
```

**Key Files**:

| File | Purpose | Endpoints/Functions |
|------|---------|---------------------|
| `routes/event-routes.ts` | Event ingestion | `POST /api/v1/events` |
| `routes/analytics-routes.ts` | Analytics API | `GET /cost-breakdown`, `/flamegraph`, `/timeseries`, `/prompts` |
| `routes/stream-routes.ts` | SSE streaming | `GET /api/v1/stream/events` |
| `services/event-processor.ts` | Event processing | `processEvents()`, `broadcastEvent()` |
| `services/analytics-service.ts` | Analytics queries | `getCostBreakdown()`, `getFlamegraph()`, `getTimeseries()` |
| `services/sse-manager.ts` | SSE lifecycle | `SSEManager` class |
| `db/schema.ts` | Database schema | `events` table definition |

**Database Schema** (Drizzle ORM):
```typescript
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
```

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

**Key Pages**:

| Page | Purpose | Visualizations |
|------|---------|----------------|
| `overview/page.tsx` | Cost dashboard | Total cost, model pie chart, timeseries |
| `features/page.tsx` | Feature breakdown | Treemap, bar chart, cost table |
| `flamegraph/page.tsx` | Hierarchical view | d3-flame-graph |
| `prompts/page.tsx` | Prompt inspector | Token analysis, prompt list |
| `realtime/page.tsx` | Live feed | SSE event stream, real-time counter |

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

## Known Limitations

1. **No Authentication**: Public API endpoints
2. **No Prompt Similarity**: pgvector embeddings not implemented
3. **No Multi-Tenancy**: Single workspace
4. **Provider Support**: OpenAI + Anthropic only (no Gemini SDK wrapper)
5. **No Alerts**: No cost threshold notifications
6. **Redis Caching**: Not implemented for analytics queries

## Future Enhancements

1. Gemini SDK wrapper
2. Prompt embeddings + similarity clustering
3. Cost anomaly detection
4. Multi-workspace support
5. Slack/email alerts
6. Export to CSV/Parquet
7. Horizontal scaling with read replicas
