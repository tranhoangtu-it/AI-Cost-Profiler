# Phase 3b: Backend API

## Context Links
- [System Architecture](../../docs/system-architecture.md)
- [Tech Stack](../../docs/tech-stack.md)
- [Plan Overview](./plan.md)

## Parallelization Info
- **Depends on:** Phase 2a (Shared types/schemas), Phase 2b (DB schema/connection)
- **Blocks:** Phase 5 (Integration)
- **Parallel with:** Phase 3a (SDK)

## Overview
- **Priority:** P1
- **Status:** Complete
- **Est:** 5h

Build the Express API server: event ingestion, analytics endpoints, SSE streaming, Redis integration, and event processing pipeline.

## Key Insights
- Zod schemas from shared package validate all requests
- Redis for real-time counters (INCR) and SSE pub/sub
- Event processing: validate -> enrich (verify cost) -> store (Postgres) -> aggregate (Redis) -> notify (SSE)
- Async embedding generation: after storing event, call OpenAI embeddings API for input prompt text, store in `prompt_embeddings` with pgvector
- Prompt similarity: cosine distance query on pgvector to find similar prompts within same feature
- Pino for structured JSON logging
<!-- Updated: Validation Session 1 - Added OpenAI embedding generation + pgvector similarity in event pipeline -->

## Requirements
### Functional
- POST `/api/v1/events` - batch event ingestion
- GET `/api/v1/analytics/cost-breakdown` - cost by feature/model/user
- GET `/api/v1/analytics/flamegraph` - hierarchical cost data
- GET `/api/v1/analytics/timeseries` - cost over time
- GET `/api/v1/analytics/prompts` - prompt bloat detection
- GET `/api/v1/stream/costs` - SSE real-time updates

### Non-Functional
- <100ms p95 for analytics queries (with proper indexes)
- SSE connections cleaned up on client disconnect
- Request validation on all endpoints
- CORS enabled for dashboard origin

## Architecture
```
apps/server/
├── src/
│   ├── index.ts                  # Entry: start server
│   ├── app.ts                    # Express app setup + middleware
│   ├── routes/
│   │   ├── event-routes.ts       # POST /api/v1/events
│   │   ├── analytics-routes.ts   # GET /api/v1/analytics/*
│   │   └── stream-routes.ts      # GET /api/v1/stream/costs
│   ├── services/
│   │   ├── event-processor.ts    # Ingest pipeline (validate, enrich, store, aggregate)
│   │   ├── analytics-service.ts  # Query builders for analytics endpoints
│   │   └── sse-manager.ts        # SSE connection manager + Redis pub/sub
│   ├── middleware/
│   │   ├── error-handler.ts      # Global error handler
│   │   └── request-validator.ts  # Zod validation middleware
│   ├── lib/
│   │   └── redis.ts              # Redis client setup
│   └── db/                       # (OWNED BY PHASE 2b - DO NOT TOUCH)
├── package.json
└── tsconfig.json
```

## File Ownership (Exclusive)
```
apps/server/src/index.ts
apps/server/src/app.ts
apps/server/src/routes/event-routes.ts
apps/server/src/routes/analytics-routes.ts
apps/server/src/routes/stream-routes.ts
apps/server/src/services/event-processor.ts
apps/server/src/services/analytics-service.ts
apps/server/src/services/sse-manager.ts
apps/server/src/middleware/error-handler.ts
apps/server/src/middleware/request-validator.ts
apps/server/src/lib/redis.ts
```

**NOT owned (Phase 2b):** `apps/server/src/db/*`, `apps/server/drizzle.config.ts`

## Implementation Steps

### 1. Update apps/server/package.json (merge with Phase 2b deps)
```json
{
  "name": "@ai-cost-profiler/server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format esm --dts",
    "start": "node dist/index.js",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@ai-cost-profiler/shared": "workspace:*",
    "express": "^4.18.0",
    "cors": "^2.8.0",
    "helmet": "^7.1.0",
    "ioredis": "^5.3.0",
    "pino": "^8.19.0",
    "pino-pretty": "^10.3.0",
    "drizzle-orm": "^0.30.0",
    "pg": "^8.11.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/cors": "^2.8.0",
    "@types/pg": "^8.11.0",
    "drizzle-kit": "^0.21.0",
    "tsx": "^4.7.0",
    "tsup": "^8.0.0",
    "typescript": "^5.4.0"
  }
}
```

### 2. src/lib/redis.ts
```typescript
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
export const redis = new Redis(redisUrl);
export const redisSub = new Redis(redisUrl); // Dedicated subscriber connection

redis.on('error', (err) => console.error('[redis] Connection error:', err));
```

### 3. src/middleware/request-validator.ts
```typescript
import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.query = result.data;
    next();
  };
}
```

### 4. src/middleware/error-handler.ts
```typescript
import type { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino({ name: 'error-handler' });

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}
```

### 5. src/services/event-processor.ts
```typescript
import { db, events } from '../db/index.js';
import { redis } from '../lib/redis.js';
import { lookupPricing, type LlmEvent } from '@ai-cost-profiler/shared';

const PROJECT_ID = 'default'; // MVP: single project

export async function processEventBatch(batch: LlmEvent[]): Promise<void> {
  const enriched = batch.map((event) => {
    const pricing = lookupPricing(event.model);
    const verifiedCost = pricing
      ? (event.inputTokens / 1000) * pricing.inputPricePer1k +
        (event.outputTokens / 1000) * pricing.outputPricePer1k
      : null;

    return {
      traceId: event.traceId,
      spanId: event.spanId,
      parentSpanId: event.parentSpanId,
      projectId: PROJECT_ID,
      feature: event.feature,
      userId: event.userId,
      provider: event.provider,
      model: event.model,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cachedTokens: event.cachedTokens,
      latencyMs: event.latencyMs,
      estimatedCostUsd: String(event.estimatedCostUsd),
      verifiedCostUsd: verifiedCost ? String(Math.round(verifiedCost * 1_000_000) / 1_000_000) : null,
      isCacheHit: event.cachedTokens > 0,
      metadata: event.metadata ?? null,
    };
  });

  // Store in Postgres
  await db.insert(events).values(enriched);

  // Update Redis counters
  const pipeline = redis.pipeline();
  for (const event of enriched) {
    const cost = event.verifiedCostUsd ?? event.estimatedCostUsd;
    pipeline.incrbyfloat(`rt:${PROJECT_ID}:cost:total`, Number(cost));
    pipeline.incrbyfloat(`rt:${PROJECT_ID}:cost:feature:${event.feature}`, Number(cost));
    if (event.userId) {
      pipeline.incrbyfloat(`rt:${PROJECT_ID}:cost:user:${event.userId}`, Number(cost));
    }
  }
  await pipeline.exec();

  // Publish for SSE
  const summary = {
    count: batch.length,
    totalCost: enriched.reduce((sum, e) => sum + Number(e.verifiedCostUsd ?? e.estimatedCostUsd), 0),
    timestamp: new Date().toISOString(),
    features: [...new Set(enriched.map(e => e.feature))],
  };
  await redis.publish(`stream:${PROJECT_ID}`, JSON.stringify(summary));
}
```

### 6. src/services/analytics-service.ts
```typescript
import { db, events, costAggregates } from '../db/index.js';
import { sql, eq, and, gte, lte, desc } from 'drizzle-orm';
import { redis } from '../lib/redis.js';
import type { CostBreakdownQuery } from '@ai-cost-profiler/shared';

const PROJECT_ID = 'default';

export async function getCostBreakdown(query: CostBreakdownQuery) {
  const groupCol = query.groupBy === 'feature' ? events.feature
    : query.groupBy === 'model' ? events.model
    : events.userId;

  const rows = await db
    .select({
      name: groupCol,
      totalCost: sql<number>`sum(coalesce(${events.verifiedCostUsd}, ${events.estimatedCostUsd})::numeric)`,
      totalTokens: sql<number>`sum(${events.inputTokens} + ${events.outputTokens})`,
      callCount: sql<number>`count(*)`,
      avgLatency: sql<number>`avg(${events.latencyMs})`,
    })
    .from(events)
    .where(
      and(
        eq(events.projectId, PROJECT_ID),
        gte(events.createdAt, new Date(query.from)),
        lte(events.createdAt, new Date(query.to)),
      )
    )
    .groupBy(groupCol)
    .orderBy(desc(sql`sum(coalesce(${events.verifiedCostUsd}, ${events.estimatedCostUsd})::numeric)`));

  return rows.map(r => ({
    name: r.name ?? 'unknown',
    totalCost: Number(r.totalCost),
    totalTokens: Number(r.totalTokens),
    callCount: Number(r.callCount),
    avgLatency: Math.round(Number(r.avgLatency)),
  }));
}

export async function getFlamegraphData(from: string, to: string) {
  // Build hierarchy: Project > Feature > Model
  const rows = await db
    .select({
      feature: events.feature,
      model: events.model,
      cost: sql<number>`sum(coalesce(${events.verifiedCostUsd}, ${events.estimatedCostUsd})::numeric)`,
      tokens: sql<number>`sum(${events.inputTokens} + ${events.outputTokens})`,
    })
    .from(events)
    .where(
      and(
        eq(events.projectId, PROJECT_ID),
        gte(events.createdAt, new Date(from)),
        lte(events.createdAt, new Date(to)),
      )
    )
    .groupBy(events.feature, events.model);

  // Transform to flamegraph hierarchy
  const featureMap = new Map<string, { value: number; children: { name: string; value: number; tokens: number }[] }>();
  let totalCost = 0;

  for (const row of rows) {
    const cost = Number(row.cost);
    totalCost += cost;
    if (!featureMap.has(row.feature)) {
      featureMap.set(row.feature, { value: 0, children: [] });
    }
    const entry = featureMap.get(row.feature)!;
    entry.value += cost;
    entry.children.push({ name: row.model, value: cost, tokens: Number(row.tokens) });
  }

  return {
    name: 'Project',
    value: totalCost,
    children: Array.from(featureMap.entries()).map(([feature, data]) => ({
      name: feature,
      value: data.value,
      children: data.children,
    })),
  };
}

export async function getTimeseries(from: string, to: string, granularity: string) {
  const truncExpr = granularity === 'day'
    ? sql`date_trunc('day', ${events.createdAt})`
    : granularity === 'week'
      ? sql`date_trunc('week', ${events.createdAt})`
      : sql`date_trunc('hour', ${events.createdAt})`;

  const rows = await db
    .select({
      timestamp: truncExpr,
      cost: sql<number>`sum(coalesce(${events.verifiedCostUsd}, ${events.estimatedCostUsd})::numeric)`,
      tokens: sql<number>`sum(${events.inputTokens} + ${events.outputTokens})`,
      callCount: sql<number>`count(*)`,
    })
    .from(events)
    .where(
      and(
        eq(events.projectId, PROJECT_ID),
        gte(events.createdAt, new Date(from)),
        lte(events.createdAt, new Date(to)),
      )
    )
    .groupBy(truncExpr)
    .orderBy(truncExpr);

  return rows.map(r => ({
    timestamp: String(r.timestamp),
    cost: Number(r.cost),
    tokens: Number(r.tokens),
    callCount: Number(r.callCount),
  }));
}

export async function getPromptAnalysis(from: string, to: string) {
  // Compute bloat: events where inputTokens > 2x median for same feature+model
  const medians = await db
    .select({
      feature: events.feature,
      model: events.model,
      medianInput: sql<number>`percentile_cont(0.5) within group (order by ${events.inputTokens})`,
    })
    .from(events)
    .where(
      and(
        eq(events.projectId, PROJECT_ID),
        gte(events.createdAt, new Date(from)),
        lte(events.createdAt, new Date(to)),
      )
    )
    .groupBy(events.feature, events.model);

  const medianMap = new Map<string, number>();
  for (const m of medians) {
    medianMap.set(`${m.feature}:${m.model}`, Number(m.medianInput));
  }

  // Get individual events with high token usage
  const allEvents = await db
    .select({
      id: events.id,
      feature: events.feature,
      model: events.model,
      inputTokens: events.inputTokens,
      outputTokens: events.outputTokens,
    })
    .from(events)
    .where(
      and(
        eq(events.projectId, PROJECT_ID),
        gte(events.createdAt, new Date(from)),
        lte(events.createdAt, new Date(to)),
      )
    )
    .orderBy(desc(events.inputTokens))
    .limit(100);

  return allEvents.map(e => {
    const median = medianMap.get(`${e.feature}:${e.model}`) ?? e.inputTokens;
    const bloatRatio = median > 0 ? e.inputTokens / median : 1;
    const tokenRatio = e.outputTokens > 0 ? e.inputTokens / e.outputTokens : e.inputTokens;
    const suggestions: string[] = [];
    if (bloatRatio > 2) suggestions.push('Input tokens 2x+ above median for this feature/model');
    if (tokenRatio > 10) suggestions.push('High input/output ratio (>10:1) - likely bloated prompt');

    return {
      eventId: e.id,
      feature: e.feature,
      model: e.model,
      inputTokens: e.inputTokens,
      medianInputTokens: Math.round(median),
      bloatRatio: Math.round(bloatRatio * 100) / 100,
      redundancyScore: Math.min(1, (bloatRatio - 1) / 3),
      suggestions,
    };
  });
}

export async function getRealtimeTotals() {
  const keys = await redis.keys(`rt:${PROJECT_ID}:cost:feature:*`);
  const total = await redis.get(`rt:${PROJECT_ID}:cost:total`);
  const features: Record<string, number> = {};

  if (keys.length > 0) {
    const values = await redis.mget(keys);
    keys.forEach((key, i) => {
      const featureName = key.split(':').pop()!;
      features[featureName] = Number(values[i] ?? 0);
    });
  }

  return { totalCost: Number(total ?? 0), features };
}
```

### 7. src/services/sse-manager.ts
```typescript
import type { Response } from 'express';
import { redisSub } from '../lib/redis.js';

const PROJECT_ID = 'default';
const clients = new Set<Response>();

// Subscribe to Redis channel
redisSub.subscribe(`stream:${PROJECT_ID}`);
redisSub.on('message', (_channel, message) => {
  for (const client of clients) {
    client.write(`data: ${message}\n\n`);
  }
});

export function addSSEClient(res: Response): void {
  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
  });
}

export function getClientCount(): number {
  return clients.size;
}
```

### 8. src/routes/event-routes.ts
```typescript
import { Router } from 'express';
import { batchEventRequestSchema } from '@ai-cost-profiler/shared';
import { validateBody } from '../middleware/request-validator.js';
import { processEventBatch } from '../services/event-processor.js';

export const eventRouter = Router();

eventRouter.post(
  '/events',
  validateBody(batchEventRequestSchema),
  async (req, res, next) => {
    try {
      await processEventBatch(req.body.events);
      res.status(202).json({ accepted: req.body.events.length });
    } catch (err) {
      next(err);
    }
  },
);
```

### 9. src/routes/analytics-routes.ts
```typescript
import { Router } from 'express';
import { costBreakdownQuerySchema, timeRangeSchema } from '@ai-cost-profiler/shared';
import { validateQuery } from '../middleware/request-validator.js';
import {
  getCostBreakdown,
  getFlamegraphData,
  getTimeseries,
  getPromptAnalysis,
  getRealtimeTotals,
} from '../services/analytics-service.js';

export const analyticsRouter = Router();

analyticsRouter.get('/cost-breakdown', validateQuery(costBreakdownQuerySchema), async (req, res, next) => {
  try {
    const data = await getCostBreakdown(req.query as any);
    res.json({ data });
  } catch (err) { next(err); }
});

analyticsRouter.get('/flamegraph', validateQuery(timeRangeSchema), async (req, res, next) => {
  try {
    const { from, to } = req.query as any;
    const data = await getFlamegraphData(from, to);
    res.json({ data });
  } catch (err) { next(err); }
});

analyticsRouter.get('/timeseries', validateQuery(timeRangeSchema), async (req, res, next) => {
  try {
    const { from, to, granularity } = req.query as any;
    const data = await getTimeseries(from, to, granularity);
    res.json({ data });
  } catch (err) { next(err); }
});

analyticsRouter.get('/prompts', validateQuery(timeRangeSchema), async (req, res, next) => {
  try {
    const { from, to } = req.query as any;
    const data = await getPromptAnalysis(from, to);
    res.json({ data });
  } catch (err) { next(err); }
});

analyticsRouter.get('/realtime-totals', async (_req, res, next) => {
  try {
    const data = await getRealtimeTotals();
    res.json({ data });
  } catch (err) { next(err); }
});
```

### 10. src/routes/stream-routes.ts
```typescript
import { Router } from 'express';
import { addSSEClient, getClientCount } from '../services/sse-manager.js';
import { getRealtimeTotals } from '../services/analytics-service.js';

export const streamRouter = Router();

streamRouter.get('/costs', async (req, res) => {
  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx compat
  });

  // Send initial snapshot
  const totals = await getRealtimeTotals();
  res.write(`data: ${JSON.stringify({ type: 'snapshot', ...totals })}\n\n`);

  // Register for updates
  addSSEClient(res);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30_000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});
```

### 11. src/app.ts
```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { eventRouter } from './routes/event-routes.js';
import { analyticsRouter } from './routes/analytics-routes.js';
import { streamRouter } from './routes/stream-routes.js';
import { errorHandler } from './middleware/error-handler.js';

export const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' }));
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/v1', eventRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/stream', streamRouter);

// Error handler (must be last)
app.use(errorHandler);
```

### 12. src/index.ts
```typescript
import 'dotenv/config';
import { app } from './app.js';
import pino from 'pino';

const logger = pino({ name: 'server' });
const PORT = Number(process.env.PORT ?? 3100);

app.listen(PORT, () => {
  logger.info(`Server listening on http://localhost:${PORT}`);
});
```

### 13. Verify
- `docker compose up -d` (Postgres + Redis)
- `pnpm dev --filter @ai-cost-profiler/server`
- `curl http://localhost:3100/health` -> `{"status":"ok"}`
- `curl -X POST http://localhost:3100/api/v1/events -H 'Content-Type: application/json' -d '{"events":[]}'` -> 400 (empty array validation)

## Todo List
- [x] Update `apps/server/package.json` with all deps
- [x] Create `src/lib/redis.ts`
- [x] Create `src/middleware/request-validator.ts`
- [x] Create `src/middleware/error-handler.ts`
- [x] Create `src/services/event-processor.ts`
- [x] Create `src/services/analytics-service.ts`
- [x] Create `src/services/sse-manager.ts`
- [x] Create `src/routes/event-routes.ts`
- [x] Create `src/routes/analytics-routes.ts`
- [x] Create `src/routes/stream-routes.ts`
- [x] Create `src/app.ts`
- [x] Create `src/index.ts`
- [x] Test health endpoint
- [x] Test event ingestion with sample payload

## Success Criteria
- Server starts on port 3100
- Health endpoint returns 200
- POST `/api/v1/events` validates and stores events in Postgres
- Redis counters updated on event ingestion
- SSE endpoint streams updates
- Analytics endpoints return correct aggregated data

## Conflict Prevention
Phase 3b owns all `apps/server/src/` except `src/db/` (owned by Phase 2b). `package.json` deps merged with Phase 2b additions.

## Risk Assessment
- **Redis not running:** Server should start with warning; Redis operations fail gracefully
- **DB not migrated:** Server crashes if tables missing; Phase 2b must complete first
- **Large batch ingestion:** 500 event max per batch (validated by Zod schema)

## Security
- Helmet security headers
- CORS restricted to dashboard origin
- JSON body limit (5MB)
- Zod validation on all inputs
- No raw SQL (Drizzle ORM only)

## Next Steps
Phase 5 (Integration) connects frontend to these endpoints.
