# Phase 3b Implementation Report: API Server

## Executed Phase
- **Phase**: phase-03b-api-server
- **Plan**: /Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/plans/260219-0107-ai-cost-profiler-mvp/
- **Status**: Completed
- **Date**: 2026-02-19

## Files Modified

### Created (11 files, ~790 lines total)

1. **apps/server/src/lib/redis.ts** (76 lines)
   - Redis client + subscriber connection setup
   - Connection/disconnection handlers
   - Redis key constants
   - Initialization logic

2. **apps/server/src/middleware/request-validator.ts** (43 lines)
   - Zod schema validation for body
   - Zod schema validation for query params

3. **apps/server/src/middleware/error-handler.ts** (46 lines)
   - Global error handler with pino logger
   - 404 handler for unknown routes

4. **apps/server/src/services/event-processor.ts** (96 lines)
   - Batch event processing with cost enrichment
   - PostgreSQL insertion via Drizzle
   - Redis counter updates via pipeline
   - SSE message publishing

5. **apps/server/src/services/analytics-service.ts** (177 lines)
   - getCostBreakdown: GROUP BY with SUM/COUNT/AVG
   - getFlamegraphData: hierarchical Project > Feature > Model
   - getTimeseries: date_trunc aggregation
   - getPromptAnalysis: bloat detection (>1.5x median)
   - getRealtimeTotals: Redis counter reads

6. **apps/server/src/services/sse-manager.ts** (116 lines)
   - SSE connection manager singleton
   - Redis pub/sub subscription
   - Broadcast to all clients
   - Auto-cleanup on disconnect

7. **apps/server/src/routes/event-routes.ts** (29 lines)
   - POST /events endpoint with batch validation

8. **apps/server/src/routes/analytics-routes.ts** (77 lines)
   - GET /cost-breakdown
   - GET /flamegraph
   - GET /timeseries
   - GET /prompts
   - GET /realtime-totals

9. **apps/server/src/routes/stream-routes.ts** (10 lines)
   - GET /costs SSE endpoint

10. **apps/server/src/app.ts** (49 lines)
    - Express app factory with helmet, CORS, JSON parser
    - Route mounting
    - Error handling

11. **apps/server/src/index.ts** (61 lines)
    - Server entry point with dotenv
    - Redis + PostgreSQL connection
    - Graceful shutdown handlers

### Updated (1 file)

12. **apps/server/package.json**
    - Added scripts: dev, build, start, lint
    - Added deps: @ai-cost-profiler/shared, express, cors, helmet, ioredis, pino, pino-pretty
    - Added devDeps: @types/express, @types/cors, tsx, tsup

## Tasks Completed

- [x] Updated package.json with Express + Redis dependencies
- [x] Created Redis client with dedicated subscriber
- [x] Created request validation middleware (validateBody, validateQuery)
- [x] Created error handler middleware with pino logger
- [x] Created event processor service (batch enrichment, DB insert, Redis update, SSE publish)
- [x] Created analytics service (cost breakdown, flamegraph, timeseries, prompts, realtime)
- [x] Created SSE manager service (pub/sub, broadcast, cleanup)
- [x] Created event routes (POST /events)
- [x] Created analytics routes (5 GET endpoints)
- [x] Created stream routes (GET /costs SSE)
- [x] Created Express app factory
- [x] Created server entry point with graceful shutdown
- [x] Fixed TypeScript DTS build errors (Router type annotations)

## Tests Status

- **Type check**: Pass (build completed with DTS generation)
- **Unit tests**: Not implemented (out of scope for Phase 3b)
- **Integration tests**: Not implemented (deferred to Phase 8)
- **Build**: Pass (turbo build successful)

## Implementation Details

### Cost Calculation
- Uses `lookupPricing(model)` from shared package
- Pricing per 1M tokens (not 1K)
- Formula: `tokens / 1_000_000 * pricePer1M`
- Supports cached tokens for Anthropic/Gemini

### Redis Integration
- Separate connections for commands vs pub/sub (ioredis best practice)
- Atomic counter updates via pipeline
- Real-time SSE via pub/sub channel

### Analytics Queries
- **Cost breakdown**: Dynamic GROUP BY (feature/model/provider/user)
- **Flamegraph**: 3-level hierarchy with cost rollup
- **Timeseries**: DATE_TRUNC by hour/day/week
- **Prompt analysis**: Median baseline + 1.5x threshold for bloat

### SSE Architecture
- Singleton manager tracks all clients
- Auto-subscribe on first client
- Auto-unsubscribe when last client disconnects
- Dead client detection and cleanup

### API Endpoints

**POST /api/events**
- Body: `{ events: LlmEvent[] }` (max 500)
- Returns: 202 Accepted

**GET /api/analytics/cost-breakdown?from=...&to=...&granularity=...&groupBy=...**
**GET /api/analytics/flamegraph?from=...&to=...&granularity=...**
**GET /api/analytics/timeseries?from=...&to=...&granularity=...**
**GET /api/analytics/prompts?from=...&to=...&granularity=...**
**GET /api/analytics/realtime-totals**

**GET /api/stream/costs** (SSE)
- Content-Type: text/event-stream
- Messages: `{ type, data: { costDelta, requestsDelta, tokensDelta, timestamp } }`

## Issues Encountered

1. **TypeScript DTS Build Error**: Router type inference failed
   - **Solution**: Added explicit `Router as RouterType` annotations to exports

## File Ownership Compliance

- Modified ONLY files in apps/server/src/ (owned by Phase 3b)
- Did NOT touch apps/server/src/db/* (owned by Phase 2b)
- Did NOT touch packages/shared/* (owned by Phase 3a)

## Next Steps

- Phase 3b unblocks Phase 4a (Next.js app scaffold)
- Phase 3b unblocks Phase 5a (dashboard pages)
- Integration testing in Phase 8 will verify:
  - Event ingestion flow
  - Redis counter accuracy
  - SSE real-time updates
  - Analytics query correctness

## Environment Variables Required

```bash
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost:5432/ai_cost_profiler
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=*
NODE_ENV=development
```

## Build Output

- **dist/index.js**: 21.8 KB (ESM bundle)
- **dist/index.d.ts**: 13 bytes (type definitions)

## Dependencies Summary

**Runtime**: express, cors, helmet, ioredis, pino, pino-pretty, drizzle-orm, pg, dotenv
**Dev**: @types/express, @types/cors, @types/pg, tsx, tsup, typescript, drizzle-kit

Total LOC added: ~790 lines across 11 new files
