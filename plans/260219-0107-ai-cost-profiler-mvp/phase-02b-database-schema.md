# Phase 2b: Database Schema

## Context Links
- [System Architecture](../../docs/system-architecture.md)
- [Tech Stack](../../docs/tech-stack.md)
- [Plan Overview](./plan.md)

## Parallelization Info
- **Depends on:** Phase 1
- **Blocks:** Phase 3b (Backend API)
- **Parallel with:** Phase 2a (Shared Package)

## Overview
- **Priority:** P1
- **Status:** Complete
- **Est:** 2h

Create Drizzle ORM schema for PostgreSQL tables (events, model_pricing, prompt_analysis, cost_aggregates), connection module, Drizzle config, and initial migration.

## Key Insights
- Drizzle chosen for type-safe SQL-like API, lightweight, good migration story
- JSONB for flexible metadata field on events
- BRIN index on `created_at` for time-range queries (append-only data)
- Separate `model_pricing` table allows runtime price updates without code changes

## Requirements
### Functional
- 5 tables: `events`, `model_pricing`, `prompt_analysis`, `prompt_embeddings`, `cost_aggregates`
- Enable pgvector extension in migration (`CREATE EXTENSION IF NOT EXISTS vector`)
- `prompt_embeddings` table: `event_id` FK, `embedding` vector(1536), `prompt_hash` text
<!-- Updated: Validation Session 1 - Added pgvector + prompt_embeddings table for similarity detection -->
- Proper indexes for analytics query patterns
- Connection pooling via `pg` Pool
- Drizzle config for migration CLI

### Non-Functional
- All columns typed; no raw SQL for schema
- Migration reproducible via `drizzle-kit generate`

## Architecture
```
apps/server/
├── src/
│   └── db/
│       ├── schema.ts       # Drizzle table definitions
│       ├── connection.ts   # pg Pool + drizzle instance
│       └── index.ts        # Re-export
├── drizzle.config.ts       # Drizzle Kit config
└── drizzle/                # Generated migrations (auto)
```

## File Ownership (Exclusive)
```
apps/server/src/db/schema.ts
apps/server/src/db/connection.ts
apps/server/src/db/index.ts
apps/server/drizzle.config.ts
apps/server/drizzle/           (generated)
```

## Implementation Steps

### 1. Add dependencies to apps/server/package.json
Add to the stub from Phase 1:
```json
{
  "dependencies": {
    "drizzle-orm": "^0.30.0",
    "pg": "^8.11.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.21.0",
    "@types/pg": "^8.11.0"
  },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

### 2. apps/server/drizzle.config.ts
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### 3. apps/server/src/db/schema.ts
```typescript
import {
  pgTable, uuid, text, integer, numeric,
  timestamp, jsonb, boolean, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── events ───
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  traceId: text('trace_id').notNull(),
  spanId: text('span_id').notNull(),
  parentSpanId: text('parent_span_id'),
  projectId: text('project_id').notNull().default('default'),
  feature: text('feature').notNull(),
  userId: text('user_id'),
  provider: text('provider').notNull(),   // 'openai' | 'anthropic'
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  cachedTokens: integer('cached_tokens').notNull().default(0),
  latencyMs: integer('latency_ms').notNull(),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }).notNull(),
  verifiedCostUsd: numeric('verified_cost_usd', { precision: 12, scale: 6 }),
  isCacheHit: boolean('is_cache_hit').notNull().default(false),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  featureTimeIdx: index('idx_events_feature_time').on(table.projectId, table.feature, table.createdAt),
  userTimeIdx: index('idx_events_user_time').on(table.projectId, table.userId, table.createdAt),
  createdAtIdx: index('idx_events_created_at').on(table.createdAt),
  traceIdx: index('idx_events_trace').on(table.traceId),
}));

// ─── model_pricing ───
export const modelPricing = pgTable('model_pricing', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputPricePer1k: numeric('input_price_per_1k', { precision: 10, scale: 6 }).notNull(),
  outputPricePer1k: numeric('output_price_per_1k', { precision: 10, scale: 6 }).notNull(),
  effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  modelUniq: uniqueIndex('idx_model_pricing_uniq').on(table.provider, table.model, table.effectiveDate),
}));

// ─── prompt_analysis ───
export const promptAnalysis = pgTable('prompt_analysis', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  inputTokenRatio: numeric('input_token_ratio', { precision: 8, scale: 4 }),
  redundancyScore: numeric('redundancy_score', { precision: 5, scale: 4 }),
  suggestions: jsonb('suggestions').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventIdx: index('idx_prompt_analysis_event').on(table.eventId),
}));

// ─── cost_aggregates ───
export const costAggregates = pgTable('cost_aggregates', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: text('project_id').notNull().default('default'),
  feature: text('feature').notNull(),
  model: text('model').notNull(),
  period: text('period').notNull(), // 'hour' | 'day'
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  totalCost: numeric('total_cost', { precision: 12, scale: 6 }).notNull().default('0'),
  totalTokens: integer('total_tokens').notNull().default(0),
  callCount: integer('call_count').notNull().default(0),
  avgLatency: numeric('avg_latency', { precision: 10, scale: 2 }).notNull().default('0'),
}, (table) => ({
  aggregateIdx: uniqueIndex('idx_cost_agg_uniq').on(
    table.projectId, table.feature, table.model, table.period, table.periodStart
  ),
  periodIdx: index('idx_cost_agg_period').on(table.projectId, table.period, table.periodStart),
}));
```

### 4. apps/server/src/db/connection.ts
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });
export { pool };
```

### 5. apps/server/src/db/index.ts
```typescript
export { db, pool } from './connection.js';
export * from './schema.js';
```

### 6. Generate migration
```bash
cd apps/server && pnpm db:generate
```
This creates `drizzle/0000_*.sql` with CREATE TABLE statements.

### 7. Push to local DB
```bash
cd apps/server && pnpm db:push
```

## Todo List
- [x] Add Drizzle + pg deps to `apps/server/package.json`
- [x] Create `drizzle.config.ts`
- [x] Create `src/db/schema.ts` with all 4 tables
- [x] Create `src/db/connection.ts`
- [x] Create `src/db/index.ts`
- [x] Generate initial migration
- [x] Push schema to local Postgres
- [x] Verify tables exist via `psql`

## Success Criteria
- `drizzle-kit generate` produces valid SQL migration
- `drizzle-kit push` creates all 4 tables in Postgres
- All indexes created
- `db` export is typed and autocompletes table columns

## Conflict Prevention
Phase 2b owns ONLY `apps/server/src/db/` and `apps/server/drizzle.config.ts`. Phase 3b owns all other `apps/server/src/` files. Phase 1 owns `apps/server/package.json` stub (Phase 2b adds deps to it).

**Note:** Phase 2b and Phase 3b both need to modify `apps/server/package.json`. Resolution: Phase 2b adds DB deps. Phase 3b adds server deps. Implementers merge both sets.

## Risk Assessment
- **Pool exhaustion:** 20 max connections sufficient for MVP
- **Migration conflicts:** Only Phase 2b touches schema; no conflicts

## Security
- Database URL from env; never hardcoded
- Connection pool limits prevent resource exhaustion

## Next Steps
Phase 3b (Backend API) depends on this for DB queries.
