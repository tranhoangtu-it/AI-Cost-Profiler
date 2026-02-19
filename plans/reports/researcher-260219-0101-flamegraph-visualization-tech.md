# Flamegraph & Cost Visualization Research Report

## 1. Flamegraph Libraries & Data Format

**d3-flame-graph**: D3.js-based flame graph renderer. Uses hierarchical stack data (samples array with stack frames). Best for CPU/execution profiling.

**Speedscope**: Browser profiler supporting multiple formats (Safari JS timeline, Chromium devtools, perf Linux). Nests stack traces in JSON. Real-time capable via WebSocket.

**flamegraph.js**: Lightweight alternative. Requires preprocessed stacks (pid/tid/function/samples). Simpler than d3 but less customizable.

**Key Data Format**: Stack frames as nested array `[caller, callee]` with sample counts. Speedscope uses: `{"name":"func","value":time,"children":[...]}`.

---

## 2. Cost Attribution Visualizations

**Sankey Diagrams** (D3-sankey): Flow token/cost from model → feature → user. Best for tracing cost dependencies. Data: source/target/value tuples.

**Treemaps**: Hierarchical cost breakdown (model > feature > user). Uses `cost` as area metric. Easy cost-at-a-glance via D3-treemap or Visx.

**Waterfall Charts**: Cumulative costs. Start baseline → add calls/models → cost impact. Perfect for "where did budget go". Use Recharts/Visx for stacking.

**Recommendation**: Treemap + Sankey combo. Treemap for quick overview, Sankey for flow analysis.

---

## 3. Real-Time Dashboard: WebSocket vs SSE

| Feature | WebSocket | SSE |
|---------|-----------|-----|
| Bidirectional | Yes | No (server→client) |
| Latency | <10ms | 50-100ms |
| Fallback | Polling | HTTP/2 native |
| Setup | Complex | Simple (EventSource API) |
| Cost tracking suitability | High-freq updates | Standard polling (1-5sec) |

**Decision**: Use **SSE + polling** for MVP. Simpler server (no stateful connections), sufficient for cost metrics (update every 1-5sec). Upgrade to WebSocket only if <100ms latency critical.

---

## 4. SDK/Middleware Interception Pattern

**Approach**: Wrapper pattern around provider SDKs.

```
Request → Middleware → [Token count + timestamp] → Provider SDK → Response
         ↓ (capture start time, model, tokens_in)
         [Extract usage from response] → Cost calc → Emit to collector
```

**For OpenAI/Anthropic**: Wrap `createMessage()` / `chat.completions.create()`. Intercept response headers for token usage.

**For non-provider APIs**: Manual instrumentation via `@instrument` decorators or function wrappers.

**Key library**: Use Provider's native token counters (OpenAI tokenizer via `tiktoken`, Anthropic's `token_counter_api`).

---

## 5. Token Counting Approaches

**tiktoken (OpenAI)**: Fast, accurate, cl100k_base encoding. Supports GPT-3.5/4 models. JS version available (`js-tiktoken`).

**Anthropic**: Use official token-counting endpoint `/messages/count_tokens` (recommended) or local `claude-tokenizer` npm package. More accurate for Claude models.

**Strategy**: Model-specific counters > generic encodings. Cache tokenizer instances. Pre-count prompt templates.

**Cost calculation**: `tokens_in * price_per_1k + tokens_out * price_per_1k_out`.

---

## 6. Recommended Tech Stack

**Frontend**:
- React + Visx (lightweight D3 wrapper) for charts
- Recharts alternative for simpler waterfall/bar charts
- Mantine/Chakra UI for dashboard components
- TanStack Query for cache/real-time updates

**Backend**:
- Node.js (TypeScript) for speed + SDK compatibility
- Express middleware for request/response interception
- Redis for real-time metric aggregation (INCR/EXPIRE for bucketing)
- PostgreSQL for historical analysis (cost tables indexed by timestamp/user/model)

**Data Collection**:
- OpenTelemetry SDK for span-based instrumentation
- Custom metrics via StatsD → Prometheus (optional, if metrics monitoring needed)

---

## 7. Data Pipeline: Collection → Aggregation → Visualization

```
LLM Call
  ↓
Middleware: [capture tokens, model, latency, user, feature]
  ↓
In-memory buffer (batch 100 events / 1sec) → Flush to queue
  ↓
Event Queue (Redis streams or message queue)
  ↓
Aggregator: Group by [model, user, feature, timestamp_bucket(1min)]
  ↓
Persist: PostgreSQL + Redis cache (latest 24hrs)
  ↓
API: /metrics/cost?filter=model,user,feature → JSON
  ↓
Frontend: Fetch on load + SSE for updates → Visualize
```

**Optimization**:
- Batch writes (100ms or 1000 events)
- Use database materialized views for pre-aggregated dimensions
- Cache last 24hrs in Redis for dashboard speed
- Archive to S3 after 30 days

---

## Key Technical Insights

1. **Flamegraph over waterfall**: Flame graphs show execution hierarchy (which calls stack up costs), better than sequential waterfall.
2. **Flamegraph data challenge**: Need call stack correlation (parent→child). Doable via request context (OpenTelemetry trace_id, async local storage).
3. **Cost flamegraph**: Stack = feature→endpoint→model→provider. Each frame = tokens × price. Width = cost.
4. **Real-time tradeoff**: SSE sufficient for 1-5sec updates. WebSocket only if <100ms critical (AI app debugging use case).

---

## Unresolved Questions

- Should cost flamegraphs show wall-clock time OR token cost as frame width?
- How to handle concurrent requests in flamegraph (threaded stacks)?
- Provider API rate limits on token-counting endpoint (Anthropic batch counting?)?
- Multi-tenant cost attribution: shared infrastructure cost allocation strategy?
