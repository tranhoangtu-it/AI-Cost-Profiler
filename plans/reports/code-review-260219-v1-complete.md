# Code Review: AI Cost Profiler v1.0 (Phases 1-4)

**Reviewer:** code-reviewer
**Date:** 2026-02-19
**Scope:** Complete MVP codebase - SDK, Backend, Dashboard, Tests

---

## Scope

- **Files reviewed:** 30 source files + 14 test files
- **LOC (source):** ~3,400 (SDK: 810, Backend: 1,290, Dashboard: 700, Shared: 300, Seed: 155)
- **Focus:** Security, error handling, type safety, performance, edge cases
- **Packages:** `packages/sdk`, `packages/shared`, `apps/server`, `apps/web`, `scripts/`

---

## Overall Assessment

Solid MVP implementation with clean architecture. The monorepo structure is well-organized with proper separation of concerns. The Proxy-based SDK interceptor pattern is elegant and non-invasive. Key strengths: Zod validation on all endpoints, cursor-based pagination, graceful error handling in the SDK. Key weaknesses: SQL injection vulnerability in export routes, missing SSE connection limits, rate limiter TOCTOU race condition, and several `any` type escapes.

**Verdict: SHIP with 2 critical fixes and 4 high-priority fixes before production.**

---

## Critical Issues

### C1. SQL Injection in Export Route `/api/v1/export/cost-summary`

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/server/src/routes/export-routes.ts` (lines 130-133)

The `startDate` and `endDate` query parameters are interpolated directly into raw SQL via string concatenation:

```typescript
// VULNERABLE - raw string interpolation into SQL
if (startDate) conditions.push(`created_at >= '${startDate}'`);
if (endDate) conditions.push(`created_at <= '${endDate}'`);
const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
// ...
${sql.raw(whereClause)}
```

An attacker can inject arbitrary SQL via `startDate` or `endDate` parameters (e.g., `' OR 1=1; DROP TABLE events; --`).

**Fix:** Use parameterized queries consistent with the `/events` export endpoint (lines 18-19) which already does this correctly:

```typescript
const conditions = [];
if (startDate) conditions.push(gte(events.createdAt, new Date(startDate as string)));
if (endDate) conditions.push(lte(events.createdAt, new Date(endDate as string)));
```

**Impact:** Full database compromise. This is the only SQL injection vector found; all other raw SQL uses parameterized values or whitelisted columns.

---

### C2. Missing Input Validation on Export Route Date Parameters

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/server/src/routes/export-routes.ts` (lines 12, 112)

Neither export endpoint validates query parameters with Zod schemas (unlike analytics routes which use `validateQuery`). The `startDate`, `endDate`, `groupBy`, and `format` parameters are used directly from `req.query` with no validation middleware.

**Fix:** Add `validateQuery(baseTimeRangeSchema)` or a dedicated export query schema:

```typescript
const exportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  feature: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});
```

**Impact:** Complements C1 fix; prevents malformed dates from reaching the query layer.

---

## High Priority

### H1. Rate Limiter TOCTOU Race Condition

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/server/src/middleware/rate-limiter.ts` (lines 30-35)

The `INCR` and `EXPIRE` commands are not atomic. Between `incr(key)` returning 1 and `expire(key, windowSeconds)`, the key could be incremented by another request, causing the TTL to be set on an already-incremented counter. If the process crashes between INCR and EXPIRE, the key persists forever with no TTL.

```typescript
const count = await redis.incr(key);
// RACE: key exists but no TTL if crash here
if (count === 1) {
  await redis.expire(key, config.windowSeconds);
}
```

**Fix:** Use a Lua script or `redis.multi()` pipeline for atomicity, or use `SET key 1 EX windowSeconds NX` combined with `INCR`:

```typescript
// Option A: Use MULTI/EXEC
const multi = redis.multi();
multi.incr(key);
multi.expire(key, config.windowSeconds);
const results = await multi.exec();
const count = results[0][1] as number;
```

**Impact:** Edge case, but in high-concurrency scenarios keys could accumulate without TTL, causing permanent rate blocking for an IP.

---

### H2. No SSE Connection Limit

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/server/src/services/sse-manager.ts`

The `SSEManager` has no upper bound on connected clients. A malicious actor could open thousands of SSE connections and exhaust server file descriptors or memory.

**Fix:** Add a max client limit:

```typescript
private readonly maxClients = 100;

async addClient(res: Response): Promise<void> {
  if (this.clients.size >= this.maxClients) {
    res.status(503).json({ error: 'Too many SSE connections' });
    return;
  }
  // ...existing logic
}
```

**Impact:** Denial of service via connection exhaustion.

---

### H3. Export Routes Load Entire Result Set Into Memory

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/server/src/routes/export-routes.ts` (lines 54-63, 90-100)

Both export endpoints execute `await query.execute()` which loads ALL matching rows into memory before streaming/responding. For large datasets, this will OOM the server.

The comment on line 53 says "Stream results to avoid loading all data into memory" but the implementation contradicts this - it fetches all results first, then writes them to the CSV stringifier.

**Fix:** Use a database cursor or streaming query with Drizzle. For MVP, add a hard LIMIT:

```typescript
const MAX_EXPORT_ROWS = 10000;
query = query.limit(MAX_EXPORT_ROWS);
```

Also add the limit info in response headers so clients know the data was truncated.

**Impact:** OOM crash on large datasets. Rate limiting (10 req/min) mitigates but does not prevent.

---

### H4. Anthropic Streaming: Event Emitted Per Delta, Not Per Complete Message

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/packages/sdk/src/providers/anthropic-interceptor.ts` (lines 44-80)

The `onDelta` callback emits a profiling event for *every* `message_delta` event in the stream. Anthropic sends multiple delta events during streaming, so this will create multiple profiling events for a single API call. Only the final delta with cumulative `output_tokens` should be captured.

Compare with OpenAI interceptor which correctly emits only when `chunk.usage` is present (final chunk).

**Fix:** Accumulate output tokens and emit a single event after the stream completes:

```typescript
let outputTokens = 0;
// In onDelta: just accumulate
// outputTokens = usage.output_tokens; (it's cumulative in Anthropic)
// Emit event in stream completion, not per-delta
```

The streaming helper `wrapAnthropicStream` calls `onDelta` for every `message_delta` event - need to restructure to emit once at stream end.

**Impact:** Inflated event counts and cost tracking for Anthropic streaming calls. Each streaming call generates N events instead of 1.

---

## Medium Priority

### M1. Gemini Interceptor: `generateContentStream` Error Handling After Stream Starts

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/packages/sdk/src/providers/gemini-interceptor.ts` (lines 123-201)

The try/catch in `generateContentStream` only catches errors when *starting* the stream (line 130). If the stream starts successfully but fails mid-stream (e.g., network interruption), the error occurs inside the `wrapGeminiStream` async generator and is NOT caught by this handler. No error event would be emitted.

**Fix:** Add error handling inside the wrapping generator in `streaming-helpers.ts`:

```typescript
async function* wrappedStream() {
  try {
    for await (const chunk of streamResult.stream) {
      yield chunk;
    }
    // ...existing usage extraction
  } catch (error) {
    onError?.(error); // New callback for mid-stream errors
    throw error;
  }
}
```

**Impact:** Missing error telemetry for mid-stream failures across all three providers.

---

### M2. `any` Type Overuse in SDK Interceptors

**Files:**
- `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/packages/sdk/src/providers/gemini-interceptor.ts` - `client: any`, `return: any`
- `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/packages/sdk/src/profiler-wrapper.ts` lines 54-74 - `client as any` casts

The Gemini interceptor accepts and returns `any`, losing all type safety. While necessary due to the multiple Gemini SDK variants, consider a minimal interface:

```typescript
interface GeminiModel {
  model?: string;
  generateContent: (...args: any[]) => Promise<any>;
  generateContentStream?: (...args: any[]) => Promise<any>;
}
```

**Impact:** Compile-time safety lost for Gemini integration. OpenAI and Anthropic interceptors correctly use typed SDK imports.

---

### M3. `promptEmbeddings` Table Imported But Never Used in Queries

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/server/src/services/prompt-similarity-service.ts` (line 1)

```typescript
import { db, events, promptEmbeddings } from '../db/index.js';
```

`promptEmbeddings` is imported but never referenced. The TODO comment (lines 182-198) describes future pgvector usage. Dead import.

**Fix:** Remove unused import until pgvector implementation.

---

### M4. `seed-demo-data.ts` Uses `isCacheHit: false` Always

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/scripts/seed-demo-data.ts` (line 124)

Even when `cachedTokens > 0`, `isCacheHit` is hardcoded to `false`. The event processor (line 40) calculates it correctly from `cachedTokens`, but the seed data bypasses the processor.

**Fix:** `isCacheHit: cachedTokens > 0`

**Impact:** Dashboard cache hit metrics show 0% for seed data, misleading during demo.

---

### M5. Time Range Recalculation Not Tied to Navigation

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/web/src/lib/time-range-context.tsx` (line 39)

`calculateTimeRange` is memoized by `range` value, so the `to` timestamp is fixed when the user first selects "24h" and doesn't update until they switch ranges and back. If a user stays on "24h" for 30 minutes, data from those 30 minutes won't appear.

**Fix:** Include a refresh interval or derive `from`/`to` at query time rather than memoizing:

```typescript
// Recalculate on each render instead of memoizing
const timeRange = calculateTimeRange(range);
```

Or add a periodic refresh mechanism.

**Impact:** Stale data window; minor UX issue for long-running dashboard sessions.

---

### M6. Unhandled `new Date(startDate as string)` in Export Routes

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/server/src/routes/export-routes.ts` (lines 18-19)

`new Date(startDate as string)` with an invalid date string produces `Invalid Date` which propagates to the database as a bad filter. No validation of date format.

**Fix:** Validate before use or rely on the Zod schema fix from C2.

---

### M7. DRY Violation: Error Classification Functions

**Files:**
- `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/packages/sdk/src/providers/openai-interceptor.ts` (lines 177-191)
- `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/packages/sdk/src/providers/anthropic-interceptor.ts` (lines 172-186)

`classifyOpenAIError` and `classifyAnthropicError` are nearly identical (same logic, same error codes). Only `classifyGeminiError` differs slightly (checks for Google-specific error strings).

**Fix:** Extract a shared `classifyApiError(error, providerSpecificMatchers?)` utility.

---

## Low Priority

### L1. ExportButton Uses `alert()` for Error Notification

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/web/src/components/dashboard/export-button.tsx` (line 24)

`alert('Export failed. Please try again.')` is a blocking browser dialog. Consider a toast notification consistent with the rest of the UI.

---

### L2. Sidebar Nav Active State Uses `startsWith`

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/web/src/components/layout/sidebar-nav.tsx` (line 31)

`pathname.startsWith(item.href)` means `/models` would match for a hypothetical `/modelserver` route. Not a current issue, but fragile.

---

### L3. RealtimeFeed Does Not Reconnect After SSE Disconnection

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/web/src/components/charts/realtime-feed.tsx` (lines 37-39)

On SSE error, the connection is closed but never reconnected. The user sees "Disconnected" permanently until page refresh.

**Fix:** Add exponential backoff reconnection:

```typescript
eventSource.onerror = () => {
  setConnected(false);
  eventSource.close();
  setTimeout(() => { /* reconnect */ }, Math.min(retryCount * 2000, 30000));
};
```

---

### L4. `analytics-service.ts` Exceeds 200-Line Guideline

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/apps/server/src/services/analytics-service.ts` (299 lines)

Per project rules, files should stay under 200 lines. Could split into `cost-breakdown-service.ts`, `flamegraph-service.ts`, `timeseries-service.ts`.

---

### L5. `gemini-interceptor.ts` Exceeds 200-Line Guideline

**File:** `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/packages/sdk/src/providers/gemini-interceptor.ts` (226 lines)

Slightly over limit. Extract `classifyGeminiError` to shared error utility (also addresses M7).

---

## Edge Cases Found by Scouting

1. **Empty usage metadata from Gemini:** Handled correctly (line 54, `if (usage)` guard) - no event emitted
2. **OpenAI stream without `stream_options`:** SDK injects `stream_options.include_usage = true` (line 40) - user's existing options would be overwritten if they set their own `stream_options`
3. **Concurrent batch flush in EventBatcher:** The `flushing` flag prevents concurrent flushes but uses `buffer.splice()` which could lose events if `add()` is called during flush (single-threaded in Node.js, so actually safe)
4. **Redis pub/sub resubscription after disconnect:** The subscriber error handler logs but does not re-subscribe. If Redis restarts, SSE stops working until server restart
5. **Cursor pagination with deleted events:** If an event used as cursor is deleted between pages, the cursor decode succeeds but the comparison query may skip/duplicate events. Acceptable for MVP.
6. **`formatCost` for negative values:** Not guarded against negative costs (should not occur, but `Math.max(0, ...)` would be defensive)

---

## Positive Observations

1. **Proxy pattern for SDK:** Non-invasive, preserves original client type signatures
2. **Zod validation on API boundaries:** All analytics routes use schema validation middleware
3. **Cursor-based pagination:** Properly implements keyset pagination with composite (timestamp, id) cursor - correct for large datasets
4. **Graceful degradation:** EventBatcher re-buffers failed sends; rate limiter fails open when Redis is down
5. **SQL injection prevention in analytics:** `GROUP_BY_COLUMNS` and `GRANULARITY_VALUES` whitelists are correct
6. **SSE dead client cleanup:** The broadcast method correctly identifies and removes failed clients
7. **Redis key TTL initialization:** `initializeRedis` handles first-run setup
8. **Test coverage:** Good coverage of edge cases in pagination, streaming, error classification, and rate limiting tests
9. **Consistent error handling:** All route handlers use try/catch with `next(error)` delegation
10. **Timer cleanup:** `EventBatcher.timer.unref()` prevents blocking Node.js exit

---

## Recommended Actions (Priority Order)

1. **[CRITICAL]** Fix SQL injection in export route cost-summary endpoint (C1)
2. **[CRITICAL]** Add Zod validation to export route parameters (C2)
3. **[HIGH]** Fix Anthropic streaming to emit single event per API call (H4)
4. **[HIGH]** Add SSE connection limit (H2)
5. **[HIGH]** Add export row limit to prevent OOM (H3)
6. **[HIGH]** Make rate limiter INCR+EXPIRE atomic (H1)
7. **[MEDIUM]** Fix mid-stream error tracking for all providers (M1)
8. **[MEDIUM]** Fix seed data `isCacheHit` (M4)
9. **[MEDIUM]** Fix time range staleness (M5)
10. **[LOW]** Add SSE reconnection logic (L3)
11. **[LOW]** Extract shared error classifier (M7)
12. **[LOW]** Split 200+ line files (L4, L5)

---

## Metrics

| Metric | Value |
|--------|-------|
| Source files reviewed | 30 |
| Test files reviewed | 14 |
| Total LOC (source) | ~3,400 |
| Total LOC (tests) | ~1,500 |
| Critical issues | 2 |
| High priority issues | 4 |
| Medium priority issues | 7 |
| Low priority issues | 5 |
| `any` casts found | ~15 (mostly in Gemini interceptor + SQL result handling) |
| Linting issues | 0 blocking (unused import in M3) |

---

## Unresolved Questions

1. Should the `threshold` parameter in `findSimilarPrompts` be validated (currently accepts any float via `parseFloat`)?
2. The `ExportButton` passes `/models`, `/features`, `/prompts` as endpoints, but export routes only define `/events` and `/cost-summary` - are these 404s in production?
3. Should `CORS_ORIGIN: '*'` be restricted before any non-local deployment?
4. The `Helmet` CSP is fully disabled (`contentSecurityPolicy: false`) - is this intentional beyond SSE support? A targeted CSP policy allowing `connect-src` for SSE would be safer.
5. Redis counter drift: If `processEventBatch` DB insert succeeds but Redis pipeline fails, counters will drift from actual data. Is eventual consistency acceptable, or should this be transactional?
