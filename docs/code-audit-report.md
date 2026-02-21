# AI Cost Profiler — Code Audit Report

## 1. Architecture Summary

**Monorepo Structure (Turborepo + pnpm workspaces)**
- `packages/shared` — Zod schemas, types, cost calculator, ID generators
- `packages/sdk` — Client-side SDK with Proxy-based interceptors for OpenAI, Anthropic, Google Gemini; EventBatcher transport
- `apps/server` — Express.js API server with PostgreSQL (Drizzle ORM), Redis (ioredis), SSE real-time streaming
- `apps/web` — Next.js 14 dashboard with Recharts, Visx treemap, d3-flame-graph, TanStack Query

**Design Patterns Used (Good)**
- Proxy pattern for non-invasive SDK interception
- Cursor-based pagination (not offset-based — correct for large datasets)
- Whitelist-guarded SQL columns to prevent injection
- Zod schema validation at API boundaries
- Event batching with backpressure (maxBufferSize=1000)
- Redis pub/sub for real-time SSE fan-out
- Singleton SSEManager with dead-client cleanup
- Graceful shutdown with SIGTERM/SIGINT handlers
- Atomic Redis INCR+EXPIRE pipeline (no TOCTOU race in rate limiter)

**Key Metrics**
- ~35 source files (excluding tests and build artifacts)
- ~15 test files with reasonable coverage
- 5 database tables with proper indexing
- 3 LLM provider interceptors
- 6 dashboard pages

## 2. Problems List (with Severity)

### CRITICAL (P0) — Must Fix Before Production

**P0-1: Hardcoded `projectId: 'default'` in event-processor.ts (line 29)**
- Severity: CRITICAL
- Every event gets projectId='default'. Multi-tenancy is impossible.
- Impact: Cannot scale to multiple customers/projects without data leakage.

**P0-2: No authentication or API key validation anywhere**
- Severity: CRITICAL
- The event ingestion endpoint (`POST /api/v1/events`) is completely open.
- Anyone can send fake events, corrupt data, or DoS the system.
- Analytics endpoints are also unprotected.

**P0-3: `pino-pretty` transport in production logger (error-handler.ts line 5-12)**
- Severity: CRITICAL
- pino-pretty is a dev tool. In production, it blocks the event loop with synchronous string formatting.
- Should use JSON output for production (structured logging).

**P0-4: Redis initialization has race condition (redis.ts lines 60-70)**
- Severity: CRITICAL
- `initializeRedis()` checks EXISTS then conditionally SETs — this is a TOCTOU race.
- Multiple server instances starting simultaneously could overwrite counters.
- Fix: Use `SETNX` (SET if Not eXists) for each key.

### HIGH (P1) — Significant Technical Debt

**P1-1: `processEventBatch` is synchronous in the request path (event-routes.ts line 21)**
- Severity: HIGH
- The POST handler awaits `processEventBatch()` which does: DB insert + Redis pipeline + Redis publish.
- Despite returning 202, it doesn't actually process asynchronously. If DB is slow, clients block.
- Should queue the work and return immediately.

**P1-2: No database migrations setup**
- Severity: HIGH
- drizzle.config.ts exists but no migration files. Schema changes require manual DDL.
- No migration history tracking.

**P1-3: Singleton module-level DB pool and Redis clients**
- Severity: HIGH
- `connection.ts` creates pool at import time. Tests must mock entire modules.
- Makes dependency injection impossible.
- `redis.ts` similarly creates clients at module scope with error handlers that use `console.error` instead of the logger.

**P1-4: `as any` type casting throughout analytics-routes.ts**
- Severity: HIGH
- Every route handler casts `req.query as any` — defeating TypeScript's type safety.
- After Zod validation, the validated types should flow through.

**P1-5: Export route loads entire result set into memory (export-routes.ts)**
- Severity: HIGH
- `MAX_EXPORT_ROWS = 10_000` but all rows are loaded into memory before streaming CSV.
- Should use database cursor/streaming for large exports.

**P1-6: Prompt similarity service swallows errors silently (prompt-similarity-service.ts line 110-113)**
- Severity: HIGH
- `catch (error) { console.error(...); return []; }` — hides failures from callers.
- Uses console.error instead of the pino logger.

**P1-7: SSE manager doesn't send heartbeat/keepalive**
- Severity: HIGH
- Without periodic keepalive comments, proxies and load balancers will timeout SSE connections.

### MEDIUM (P2) — Should Fix

**P2-1: Duplicated API_BASE constant in realtime-feed.tsx and api-client.ts**
- Severity: MEDIUM
- `const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100'` appears in two places.

**P2-2: No request ID / correlation tracking**
- Severity: MEDIUM
- No X-Request-Id header generation. Cannot trace requests through logs.

**P2-3: Cost breakdown uses raw SQL with sql.raw() (cost-breakdown-service.ts)**
- Severity: MEDIUM
- While whitelist-guarded, it mixes raw SQL with Drizzle's query builder. Should use Drizzle's query builder consistently.

**P2-4: `EventBatcher.flush()` has no retry with exponential backoff**
- Severity: MEDIUM
- Failed events are re-buffered but retried at the same interval. No backoff.

**P2-5: Missing `unhandledRejection` handler in index.ts**
- Severity: MEDIUM
- Only SIGTERM/SIGINT handled. Unhandled promise rejections will crash silently.

**P2-6: Time range context recalculates every 60s via setInterval (time-range-context.tsx)**
- Severity: MEDIUM
- Creates a new Date object every 60s even when the range hasn't changed. Minor memory/CPU waste.

**P2-7: No response type definitions in api-client.ts**
- Severity: MEDIUM
- `apiFetch<T>` is generic but callers don't specify T — everything is `any`.

**P2-8: RealtimeFeed doesn't parse SSE event types properly**
- Severity: MEDIUM
- Uses `es.onmessage` which only catches unnamed events. Named events need `addEventListener`.

### LOW (P3) — Nice to Have

**P3-1: `.env` file committed to git (has both `.env` and `apps/server/.env`)**
- Severity: LOW (assuming no real secrets)
- Even dev credentials shouldn't be in version control.

**P3-2: `desc` imported but not used in schema.ts line 2**
- Severity: LOW
- Actually used in index definition, but the import from drizzle-orm may confuse linters.

**P3-3: No health check for Redis/DB status**
- Severity: LOW
- `/health` returns 200 even if Redis or DB is down.

**P3-4: Missing error boundary in web app**
- Severity: LOW
- No React error boundary component. Chart/component errors crash the entire page.

## 3. Refactor Roadmap (Phased)

### Phase 1: Security & Stability (Week 1)
1. Add API key authentication middleware
2. Fix pino-pretty → JSON logging for production
3. Fix Redis SETNX race condition
4. Add unhandledRejection handler
5. Add request ID middleware
6. Add SSE heartbeat

### Phase 2: Type Safety & Code Quality (Week 2)
1. Remove all `as any` casts in routes — use Zod-inferred types
2. Add response types to api-client.ts
3. Replace console.error with logger in redis.ts and prompt-similarity-service.ts
4. Extract API_BASE to shared constant on frontend
5. Add proper error propagation in prompt-similarity-service
6. Make health check comprehensive (check Redis + DB)

### Phase 3: Architecture Improvements (Week 3-4)
1. Add project/tenant support (remove hardcoded 'default')
2. Implement async event processing with a queue (Bull/BullMQ)
3. Set up Drizzle migrations
4. Add database streaming for exports
5. Implement dependency injection for DB/Redis
6. Add React error boundaries

### Phase 4: Performance & Scale (Week 5+)
1. Implement costAggregates materialization (table exists but unused)
2. Add database connection pooling monitoring
3. Implement EventBatcher retry with exponential backoff
4. Add request timeout middleware
5. Implement pgvector for real prompt similarity

## 4. Migration Notes

All changes in Phase 1-2 are **non-breaking** — no API changes.

Phase 3 introduces:
- `projectId` as a required field (migration: default existing records to 'default')
- API key header requirement (migration: update SDK to include API key, provide grace period)
- Queue-based processing changes response timing (clients already expect 202, so compatible)
