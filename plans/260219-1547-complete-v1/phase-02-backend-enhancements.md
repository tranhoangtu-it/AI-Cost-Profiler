---
phase: 2
title: "Backend Enhancements - Pagination, Rate Limit, Similarity, Export"
status: pending
effort: 16h
dependencies: [1]
---

# Phase 2: Backend Enhancements

## Overview

Add production-ready backend features: cursor-based pagination, Redis rate limiting, pgvector prompt similarity, and CSV/JSON export endpoints.

**Priority:** P1 (production readiness)
**Effort:** 16h
**Parallelizable:** Yes (runs in parallel with Phase 3)

## Context Links

- Research: `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/plans/reports/researcher-260219-1543-mvp-gaps-analysis.md`
- MVP Phase 3b: `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/plans/260219-0107-ai-cost-profiler-mvp/phase-03b-backend-api.md`
- System Architecture: `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/docs/system-architecture.md`

## Key Insights

- Cursor-based pagination more efficient than offset/limit for large datasets
- Redis rate limiter prevents backend overload (10k events/hour default)
- pgvector cosine similarity requires OpenAI embeddings API
- Export endpoints should stream large datasets (no memory overflow)
- DB indexes critical: `(created_at, id)`, `(feature_name)`, `(model)`

## Requirements

### Functional
1. **Pagination**: Cursor-based (timestamp+id) for all analytics endpoints
2. **Rate Limiting**: Redis-based, per-IP, configurable threshold
3. **Prompt Similarity**: pgvector cosine similarity queries (real embeddings)
4. **Export Endpoints**: CSV/JSON streaming for large datasets
5. **Query Optimization**: DB indexes, materialized views for aggregations

### Non-Functional
- Query latency <500ms (95th percentile)
- Rate limiter adds <10ms overhead
- Export streams 100k rows without memory spike
- Similarity search <200ms for 10k prompts

## Architecture

### Pagination Pattern

```ts
// Request
GET /api/analytics/events?cursor=eyJ0aW1lIjoxNzA5..&limit=100

// Response
{
  data: [...],
  pagination: {
    nextCursor: "eyJ0aW1lIjoxNzA5..",
    hasMore: true
  }
}
```

Cursor encodes: `base64({ timestamp: number, id: string })`

### Rate Limiter Middleware

```ts
// Redis key: `rate:events:{ip}`
// TTL: 1 hour
// Counter: increment on each request
// Limit: 10,000 requests/hour

if (count > threshold) {
  res.status(429).json({
    error: 'Rate limit exceeded',
    retryAfter: ttl
  });
}
```

### Prompt Similarity Flow

```
1. User queries /api/analytics/prompts/123/similar
2. Fetch prompt text from DB
3. Generate embedding via OpenAI API (cache for 1h in Redis)
4. Query pgvector: SELECT * WHERE embedding <=> query_embedding < 0.2
5. Return top 10 similar prompts with cosine distance
```

## Related Code Files

### To Modify
- `apps/server/src/routes/analytics.ts` - Add pagination params to all endpoints
- `apps/server/src/routes/events.ts` - Add rate limiter middleware
- `apps/server/src/db/schema.ts` - Add indexes, update event table for new fields

### To Create
- `apps/server/src/middleware/rate-limiter.ts` - Redis-based rate limiting
- `apps/server/src/routes/export.ts` - CSV/JSON export endpoints
- `apps/server/src/services/similarity-service.ts` - Embedding generation + pgvector queries
- `apps/server/src/utils/pagination.ts` - Cursor encoding/decoding helpers
- `apps/server/src/db/migrations/002-add-indexes.sql` - Performance indexes

## Implementation Steps

### 1. Database Indexes (1h)

**File:** `apps/server/src/db/migrations/002-add-indexes.sql`

```sql
-- Pagination index (composite for cursor-based queries)
CREATE INDEX idx_events_created_at_id ON cost_events(created_at DESC, id);

-- Filter indexes
CREATE INDEX idx_events_feature_name ON cost_events(feature_name);
CREATE INDEX idx_events_model ON cost_events(model);
CREATE INDEX idx_events_provider ON cost_events(provider);

-- Prompt embeddings (already exists from MVP, verify)
CREATE INDEX idx_prompt_embeddings_vector ON prompt_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

Run migration with Drizzle.

### 2. Pagination Utilities (2h)

**File:** `apps/server/src/utils/pagination.ts`

```ts
export interface PaginationCursor {
  timestamp: number;
  id: string;
}

export function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

export function decodeCursor(encoded: string): PaginationCursor {
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
}

export function buildPaginatedQuery(
  baseQuery: any, // Drizzle query
  cursor?: string,
  limit: number = 100
) {
  let query = baseQuery.orderBy(desc(costEvents.createdAt), desc(costEvents.id));

  if (cursor) {
    const { timestamp, id } = decodeCursor(cursor);
    query = query.where(
      or(
        lt(costEvents.createdAt, new Date(timestamp)),
        and(
          eq(costEvents.createdAt, new Date(timestamp)),
          lt(costEvents.id, id)
        )
      )
    );
  }

  return query.limit(limit + 1); // Fetch 1 extra to check hasMore
}

export function formatPaginatedResponse<T>(data: T[], limit: number) {
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;

  const nextCursor = hasMore && items.length > 0
    ? encodeCursor({
        timestamp: items[items.length - 1].createdAt.getTime(),
        id: items[items.length - 1].id
      })
    : null;

  return { data: items, pagination: { nextCursor, hasMore } };
}
```

### 3. Rate Limiter Middleware (2h)

**File:** `apps/server/src/middleware/rate-limiter.ts`

```ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const ip = req.ip || 'unknown';
  const key = `rate:events:${ip}`;

  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 3600); // 1 hour TTL
  }

  const limit = parseInt(process.env.RATE_LIMIT_EVENTS || '10000');

  if (count > limit) {
    const ttl = await redis.ttl(key);
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: ttl
    });
  }

  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', (limit - count).toString());

  next();
}
```

**Apply to routes:**
```ts
// apps/server/src/routes/events.ts
router.post('/events', rateLimiter, handleEventIngestion);
```

### 4. Update Analytics Endpoints (3h)

**File:** `apps/server/src/routes/analytics.ts`

Update all GET endpoints:
```ts
router.get('/events', async (req, res) => {
  const { cursor, limit = 100, startDate, endDate, feature, model } = req.query;

  let query = db.select().from(costEvents);

  // Apply filters
  if (startDate) query = query.where(gte(costEvents.createdAt, new Date(startDate)));
  if (endDate) query = query.where(lte(costEvents.createdAt, new Date(endDate)));
  if (feature) query = query.where(eq(costEvents.featureName, feature));
  if (model) query = query.where(eq(costEvents.model, model));

  // Apply pagination
  const paginatedQuery = buildPaginatedQuery(query, cursor, parseInt(limit));
  const results = await paginatedQuery;

  res.json(formatPaginatedResponse(results, parseInt(limit)));
});
```

Repeat for:
- `/api/analytics/features`
- `/api/analytics/prompts`
- `/api/analytics/models`

### 5. Similarity Service (4h)

**File:** `apps/server/src/services/similarity-service.ts`

```ts
import OpenAI from 'openai';
import { Redis } from 'ioredis';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const redis = new Redis(process.env.REDIS_URL);

export async function generateEmbedding(text: string): Promise<number[]> {
  const cacheKey = `embedding:${hash(text)}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Generate embedding
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000) // Truncate to model limit
  });

  const embedding = response.data[0].embedding;

  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, JSON.stringify(embedding));

  return embedding;
}

export async function findSimilarPrompts(
  promptId: string,
  threshold: number = 0.2,
  limit: number = 10
) {
  // Fetch original prompt
  const prompt = await db.select().from(costEvents).where(eq(costEvents.id, promptId)).limit(1);
  if (!prompt[0]) throw new Error('Prompt not found');

  // Get embedding (generate if missing)
  let embedding = await db.select().from(promptEmbeddings).where(eq(promptEmbeddings.eventId, promptId));

  if (!embedding[0]) {
    const vector = await generateEmbedding(prompt[0].promptText);
    await db.insert(promptEmbeddings).values({ eventId: promptId, embedding: vector });
    embedding = [{ embedding: vector }];
  }

  // Query pgvector for similar prompts
  const results = await db.execute(sql`
    SELECT
      e.id,
      e.prompt_text,
      e.feature_name,
      e.model,
      1 - (pe.embedding <=> ${embedding[0].embedding}::vector) as similarity
    FROM prompt_embeddings pe
    JOIN cost_events e ON e.id = pe.event_id
    WHERE pe.event_id != ${promptId}
      AND 1 - (pe.embedding <=> ${embedding[0].embedding}::vector) > ${1 - threshold}
    ORDER BY pe.embedding <=> ${embedding[0].embedding}::vector
    LIMIT ${limit}
  `);

  return results.rows;
}
```

**Add endpoint:**
```ts
router.get('/prompts/:id/similar', async (req, res) => {
  const { id } = req.params;
  const { threshold = 0.8, limit = 10 } = req.query;

  const similar = await findSimilarPrompts(id, 1 - parseFloat(threshold), parseInt(limit));
  res.json(similar);
});
```

### 6. Export Endpoints (4h)

**File:** `apps/server/src/routes/export.ts`

```ts
import { stringify } from 'csv-stringify';

router.get('/export/events', async (req, res) => {
  const { format = 'csv', startDate, endDate } = req.query;

  // Build query (no pagination, stream all)
  let query = db.select().from(costEvents).orderBy(desc(costEvents.createdAt));

  if (startDate) query = query.where(gte(costEvents.createdAt, new Date(startDate)));
  if (endDate) query = query.where(lte(costEvents.createdAt, new Date(endDate)));

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=events.csv');

    const stringifier = stringify({ header: true });
    stringifier.pipe(res);

    // Stream rows
    const stream = await query.stream(); // Drizzle streaming
    for await (const row of stream) {
      stringifier.write({
        id: row.id,
        timestamp: row.createdAt.toISOString(),
        feature: row.featureName,
        model: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cost: row.cost,
        latency: row.latencyMs
      });
    }
    stringifier.end();
  } else {
    // JSON export
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=events.json');

    const events = await query;
    res.json(events);
  }
});
```

Add similar endpoints for:
- `/export/features`
- `/export/prompts`

## Todo List

- [ ] Create migration 002 with performance indexes
- [ ] Run migration to update DB schema
- [ ] Create `pagination.ts` utilities (encode/decode/build/format)
- [ ] Create `rate-limiter.ts` middleware with Redis
- [ ] Apply rate limiter to `/api/events` endpoint
- [ ] Update all analytics endpoints with pagination params
- [ ] Test pagination with >10k events (cursor encoding works)
- [ ] Create `similarity-service.ts` with OpenAI embeddings
- [ ] Add `/api/prompts/:id/similar` endpoint
- [ ] Create `export.ts` routes (CSV + JSON)
- [ ] Test export with 100k rows (no memory spike)
- [ ] Add rate limit headers to responses
- [ ] Document pagination in API docs (OpenAPI/Swagger)

## Success Criteria

- [ ] Pagination works seamlessly for 100k+ events
- [ ] Rate limiter blocks requests after 10k/hour
- [ ] Similarity search returns results in <200ms
- [ ] CSV export streams without loading full dataset into memory
- [ ] Query latency <500ms at 95th percentile
- [ ] Redis connection pooling prevents bottleneck
- [ ] All endpoints return consistent pagination format

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| pgvector index build slow on large datasets | Medium | Use `ivfflat` instead of `hnsw`, set `lists = 100` |
| OpenAI embeddings API cost high | Low | Cache embeddings in Redis, truncate prompts to 8k chars |
| Export endpoint OOM on 1M+ rows | High | Use streaming queries (Drizzle `.stream()`), test limits |
| Rate limiter Redis failure | Medium | Fallback to in-memory limiter, log errors |

## Security Considerations

- Rate limiter uses IP address (consider X-Forwarded-For spoofing behind proxy)
- Export endpoints should require auth (deferred to v1.1, but add TODO comment)
- Sanitize CSV output (escape formulas: `=`, `+`, `-`, `@`)
- Limit export file size (max 1M rows, add pagination)

## Next Steps

After Phase 2:
- Phase 3 dashboard can call paginated endpoints
- Phase 3 can add export buttons (CSV/JSON download)
- Phase 4 seed data should include realistic prompt embeddings
