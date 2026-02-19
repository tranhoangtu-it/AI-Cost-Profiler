# System Architecture

## Overview

AI Cost Profiler is a TypeScript monorepo that profiles LLM API costs through SDK instrumentation, server-side analytics, and real-time dashboard visualization.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Application                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ OpenAI SDK   │  │ Anthropic SDK│  │  Gemini SDK  │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                  │
│                            │                                     │
│                   ┌────────▼────────┐                           │
│                   │ @ai-cost/sdk    │                           │
│                   │  profileAI()    │                           │
│                   └────────┬────────┘                           │
│                            │                                     │
│                   ┌────────▼────────┐                           │
│                   │  EventBatcher   │                           │
│                   │  (10 events/5s) │                           │
│                   └────────┬────────┘                           │
└────────────────────────────┼──────────────────────────────────┘
                             │
                             │ HTTP POST /api/v1/events
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Backend Server (Express)                   │
│                                                                  │
│  ┌──────────────────┐      ┌──────────────────┐                │
│  │ Event Routes     │      │ Analytics Routes │                │
│  │ POST /events     │      │ GET /cost-breakdown              │
│  │                  │      │ GET /flamegraph  │                │
│  └────────┬─────────┘      │ GET /timeseries  │                │
│           │                │ GET /prompts     │                │
│           │                └──────────┬───────┘                │
│           │                           │                         │
│  ┌────────▼────────┐       ┌──────────▼───────┐                │
│  │ EventProcessor  │       │ AnalyticsService │                │
│  └────────┬────────┘       └──────────┬───────┘                │
│           │                           │                         │
│           ├───────────────────────────┤                         │
│           │                           │                         │
│  ┌────────▼───────────────────────────▼────────┐                │
│  │          Drizzle ORM (PostgreSQL)           │                │
│  └────────┬────────────────────────────────────┘                │
│           │                                                     │
│  ┌────────▼────────┐       ┌──────────────────┐                │
│  │   PostgreSQL    │       │      Redis       │                │
│  │  (pgvector/16)  │       │  (pub/sub cache) │                │
│  └─────────────────┘       └──────────┬───────┘                │
│                                       │                         │
│                            ┌──────────▼───────┐                 │
│                            │   SSE Manager    │                 │
│                            │ GET /stream/events                 │
│                            └──────────┬───────┘                 │
└───────────────────────────────────────┼─────────────────────────┘
                                        │
                                        │ Server-Sent Events
                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Frontend (Next.js 14 App Router)              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Overview   │  │   Features   │  │  Flamegraph  │         │
│  │   Dashboard  │  │   Breakdown  │  │              │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                  │
│                            │                                     │
│                   ┌────────▼────────┐                           │
│                   │ TanStack Query  │                           │
│                   │  (5min cache)   │                           │
│                   └────────┬────────┘                           │
│                            │                                     │
│                   ┌────────▼────────┐                           │
│                   │   API Client    │                           │
│                   │ (fetch wrapper) │                           │
│                   └─────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Event Capture (SDK)
```
LLM API Call → Proxy Interceptor → Extract Metrics → Batch Event → Send to Server
```

**Implementation**:
- `profileAI()` wraps OpenAI/Anthropic client with JavaScript Proxy
- Intercepts `.create()` method calls (chat completions, embeddings)
- Extracts: model, input/output tokens, latency, cost
- Batches via `EventBatcher` (max 10 events or 5s interval)
- Sends batch via HTTP POST to `/api/v1/events`

**Usage Example**:
```typescript
import { profileAI } from '@ai-cost-profiler/sdk';
import OpenAI from 'openai';

const openai = profileAI(new OpenAI({ apiKey }), {
  serverUrl: 'http://localhost:3100',
  feature: 'chat-summary',
});

// Calls are automatically profiled
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

### 2. Event Ingestion (Server)
```
HTTP Request → Validation → Database Insert → Redis Publish → SSE Broadcast
```

**Implementation**:
- Zod schema validation via `request-validator` middleware
- Drizzle ORM inserts into PostgreSQL `events` table
- Redis pub/sub broadcasts to SSE clients via `events` channel
- Returns 201 status on success

### 3. Analytics Queries (Server)
```
HTTP Request → SQL Query → Aggregate/Transform → JSON Response
```

**Implementation**:
- Drizzle ORM with type-safe SQL builders
- Indexed queries on `feature`, `model`, `timestamp`
- Aggregations: SUM, AVG, COUNT, GROUP BY
- Caching via Redis (5min TTL, not yet implemented)

### 4. Real-time Updates (Server → Web)
```
SSE Connection → Redis Subscribe → Event Broadcast → Client Update
```

**Implementation**:
- Client connects to `GET /api/v1/stream/events`
- Server subscribes to Redis `events` channel
- New events broadcast via SSE (`text/event-stream`)
- Web dashboard updates UI in real-time

## Component Architecture

### SDK Package (`@ai-cost-profiler/sdk`)

**Entry Point**: `profileAI(client, config)`

**Components**:
```
profileAI()
├── detectProvider() → Identifies OpenAI/Anthropic/Gemini
├── OpenAIInterceptor → Proxy for OpenAI client
├── AnthropicInterceptor → Proxy for Anthropic client
├── GeminiInterceptor → Proxy for Gemini client
├── classifyApiError() → Shared error classification
└── EventBatcher → Batches and sends events
```

**Key Design Patterns**:
- **Proxy Pattern**: Transparent LLM client wrapping
- **Batch Processing**: Reduces HTTP overhead (max 10 events or 5s)
- **Provider Detection**: Auto-detect from client instance
- **Error Classification**: Unified `classifyApiError()` maps provider errors to standard codes (rate_limit, timeout, server_error, invalid_request, unknown_error)
- **Stream Handling**: Anthropic streaming emits single event at completion (not per-delta); mid-stream errors trigger callbacks

**Event Schema**:
```typescript
{
  id: string,
  feature: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  totalCost: number,
  latency: number,
  timestamp: string (ISO 8601),
  metadata?: Record<string, unknown>
}
```

### Shared Package (`@ai-cost-profiler/shared`)

**Exports**:
- **Schemas**: Zod validation schemas (`EventSchema`, `AnalyticsSchema`)
- **Types**: TypeScript interfaces (`ModelPricing`, `SdkConfig`, `Event`)
- **Constants**: `MODEL_PRICING` (13 models with pricing)
- **Utils**: `calculateCost()`, `generateId()`

**Model Pricing Database**:
```typescript
MODEL_PRICING = {
  'gpt-4o': { provider: 'openai', inputPer1M: 2.50, outputPer1M: 10.00 },
  'claude-3-5-sonnet-20241022': { provider: 'anthropic', inputPer1M: 3.00, outputPer1M: 15.00, cachedInputPer1M: 0.30 },
  'gemini-1.5-pro': { provider: 'google-gemini', inputPer1M: 1.25, outputPer1M: 5.00, cachedInputPer1M: 0.3125 },
  // ... 10 more models
}
```

### Server (`apps/server`)

**Layers**:
```
Routes (HTTP) → Services (Business Logic) → ORM (Data Access) → Database
```

**Route Handlers**:
- `event-routes.ts` - POST /events (event ingestion, Zod validated)
- `analytics-routes.ts` - GET /cost-breakdown, /flamegraph, /timeseries, /prompts
- `stream-routes.ts` - GET /stream/events (SSE with snapshot)
- `export-routes.ts` - GET /events (CSV/JSON export, max 10,000 rows, rate limited)

**Services** (modular architecture):
- `event-processor.ts` - Event validation, storage, Redis broadcast
- `analytics-service.ts` - Main re-export module (backward compatible)
- `cost-breakdown-service.ts` - Cost breakdown by feature/model
- `flamegraph-service.ts` - Hierarchical cost aggregation
- `timeseries-service.ts` - Time-series data with configurable granularity
- `sse-manager.ts` - SSE lifecycle, Redis pub/sub, connection limit (100 clients max)

**Middleware**:
- `request-validator.ts` - Zod schema validation
- `error-handler.ts` - Global error handling with logging
- `rate-limiter.ts` - Fixed-window rate limiter using atomic Redis MULTI/EXPIRE NX

### Web App (`apps/web`)

**Architecture**: Next.js 14 App Router (Server Components + Client Components)

**Pages** (Server Components):
```
app/
├── (dashboard)/
│   ├── overview/page.tsx      → Cost overview dashboard
│   ├── features/page.tsx      → Feature breakdown
│   ├── flamegraph/page.tsx    → Hierarchical cost view
│   ├── prompts/page.tsx       → Prompt inspector
│   └── realtime/page.tsx      → Live event feed
└── layout.tsx                 → Root layout
```

**Client Components**:
```
components/
├── charts/
│   ├── cost-flamegraph.tsx    → d3-flame-graph wrapper
│   ├── cost-treemap.tsx       → Visx treemap
│   ├── cost-timeseries.tsx    → Recharts line chart
│   └── model-pie-chart.tsx    → Recharts pie chart
└── layout/
    ├── sidebar-nav.tsx        → Navigation sidebar
    └── top-bar.tsx            → Header bar
```

**State Management**:
- TanStack Query for server state (5min cache)
- React hooks for local state
- No global state library

## Database Schema

### Events Table (PostgreSQL)
```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_cost NUMERIC(10, 6) NOT NULL,
  latency INTEGER NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  metadata JSONB
);

CREATE INDEX events_feature_idx ON events(feature);
CREATE INDEX events_model_idx ON events(model);
CREATE INDEX events_timestamp_idx ON events(timestamp);
```

**Indexes**:
- `feature` - Cost breakdown queries
- `model` - Model distribution queries
- `timestamp` - Time-series queries

**Drizzle Schema** (`apps/server/src/db/schema.ts`):
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

## Redis Usage

### Pub/Sub (SSE Broadcasting)
```
Channel: "events"
Publisher: EventProcessor (on new event insert)
Subscribers: SSE clients via SSEManager
Pattern: SSE snapshot (total cost) on connect, incremental updates on new events
```

### Real-time Totals
```
Keys:
  - realtime:total_cost
  - realtime:total_requests
  - realtime:total_tokens
Update: EventProcessor increments atomically on each event
Access: SSEManager sends snapshot on connect
```

### Rate Limiting
```
Key Pattern: "ratelimit:{identifier}:{window}"
Implementation: Atomic MULTI pipeline with EXPIRE NX
Prevents: TOCTOU race condition with precise window enforcement
```

## API Design

### REST Endpoints

**Event Ingestion**:
```
POST /api/v1/events
Content-Type: application/json
Rate-Limited: Yes (atomic Redis fixed-window)

Body (array of 1-500 events):
{
  id: string,
  feature: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  totalCost: number,
  latency: number,
  timestamp: string (ISO 8601),
  cachedInputTokens?: number,
  cachedOutputTokens?: number,
  provider?: string,
  metadata?: Record<string, unknown>
}

Response: 201 Created | 400 Validation Error | 429 Rate Limited
```

**Cost Breakdown**:
```
GET /api/v1/analytics/cost-breakdown
Query: feature?, model?, startDate?, endDate?

Response: {
  features: [{ feature, totalCost, callCount, avgLatency }],
  models: [{ model, totalCost, callCount, avgCost }]
}
```

**Flamegraph**:
```
GET /api/v1/analytics/flamegraph

Response: {
  name: "root",
  value: totalCost,
  children: [{ name, value, children }]
}
```

**Time-series**:
```
GET /api/v1/analytics/timeseries
Query: from, to, granularity=hour|day|week (required)

Response: {
  timeseries: [{
    timestamp: ISO8601,
    totalCost: number,
    callCount: number,
    avgLatency: number,
    avgCostPerCall: number
  }]
}
```

**SSE Stream**:
```
GET /api/v1/stream/costs
Accept: text/event-stream

Initial: data: {"type":"snapshot","totalCost":123.45}\n\n
Updates: data: {"type":"event","...event data...}\n\n
Limit: Max 100 concurrent connections (returns 503 if exceeded)
Reconnection: Exponential backoff (max 10 retries, cap 30s)
```

**Data Export**:
```
GET /api/v1/export/events
Query: format=csv|json, from, to, feature?, model?, provider?
Rate-Limited: Yes

Response: CSV/JSON with up to 10,000 rows
Headers:
  X-Export-Row-Limit: 10000
  X-Export-Truncated: true|false (indicates if more rows exist)
```

**Data Export**:
```
GET /api/v1/export/events
Query: format=csv|json, startDate=, endDate=, feature=, model=, provider=

Response: CSV/JSON with up to 10,000 rows
Headers: X-Export-Row-Limit: 10000, X-Export-Truncated: true|false
```

## Security Architecture

### MVP (v1.0 - Hardened)
- Public API endpoints (no auth required)
- CORS configurable via `CORS_ORIGIN` env var
- Helmet middleware for security headers (CSP disabled for SSE)
- Input validation via Zod schemas (all endpoints)
- SQL injection prevention: Parameterized Drizzle queries + whitelist guards for raw SQL
- Rate limiting: Atomic Redis MULTI pipeline (fixed-window, no orphaned keys)
- Rate limit enforcement: 429 response, per-IP or per-endpoint
- SSE limits: 100 concurrent connections (503 if exceeded)
- Export limits: 10K rows max (prevents OOM attacks)
- XSS prevention: React auto-escaping + no innerHTML usage

### Future (Production - v2.0)
- API key authentication
- Per-workspace rate limiting
- Row-level security (multi-tenancy)
- Audit logging + access logs
- WAF integration
- DDoS protection

## Performance Optimizations

### SDK
- **Batching**: Reduces HTTP calls by 10x
- **Async**: Non-blocking event transmission
- **Lightweight**: < 5KB bundle size

### Server
- **Connection Pooling**: Drizzle manages PostgreSQL connections
- **Indexed Queries**: Fast lookups on feature/model/timestamp
- **Redis Caching**: 5min TTL for analytics (planned)

### Web
- **Server Components**: Reduce client JS bundle
- **Code Splitting**: Automatic via Next.js
- **React Query Caching**: Minimize API calls (5min stale time)
- **Lazy Loading**: Dynamic imports for charts

## Scalability Considerations

### Horizontal Scaling
- **Server**: Stateless, scales via load balancer
- **SSE**: Redis pub/sub for multi-instance support
- **Database**: PostgreSQL read replicas for analytics

### Vertical Scaling
- **Database**: Larger instance for high write throughput
- **Redis**: Memory optimization via LRU eviction (128MB limit)

## Technology Decisions

### Why Turborepo?
- Parallel task execution
- Intelligent caching
- Simple monorepo orchestration

### Why Drizzle ORM?
- Type-safe SQL builders
- Lightweight (no runtime overhead)
- Migration-first approach

### Why Redis?
- Pub/sub for SSE multi-instance
- Fast caching layer
- Simple key-value semantics

### Why Next.js 14 App Router?
- Server Components (reduced JS bundle)
- File-based routing
- Edge runtime support

### Why Vitest?
- Fast (native ESM, multithreading)
- Vite ecosystem compatibility
- Jest-compatible API
