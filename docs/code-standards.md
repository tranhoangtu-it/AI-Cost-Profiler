# Code Standards

## Project Structure

```
ai-cost-profiler/
├── packages/
│   ├── shared/          # Shared utilities, schemas, types
│   └── sdk/             # LLM profiling SDK
├── apps/
│   ├── server/          # Express API backend
│   └── web/             # Next.js dashboard
├── scripts/             # Utility scripts (seed, smoke test)
├── docker-compose.yml   # PostgreSQL + Redis
└── turbo.json           # Turborepo config
```

## Naming Conventions

### Files & Directories
- **TypeScript/JavaScript**: kebab-case (`event-batcher.ts`, `cost-calculator.ts`)
- **React Components**: kebab-case files, PascalCase exports (`sidebar-nav.tsx` exports `SidebarNav`)
- **Test Files**: `*.test.ts` suffix
- **Config Files**: Standard names (`package.json`, `tsconfig.json`, `vitest.config.ts`)

### Code Identifiers
- **Variables/Functions**: camelCase (`calculateCost`, `eventBatcher`)
- **Types/Interfaces**: PascalCase (`ModelPricing`, `SdkConfig`)
- **Constants**: SCREAMING_SNAKE_CASE (`MODEL_PRICING`, `DEFAULT_PRICING`)
- **Private Members**: Prefix with `_` (`_batchSize`, `_redis`)

## Code Organization

### Module Structure (packages/shared)
```
src/
├── schemas/             # Zod validation schemas
│   ├── event-schema.ts
│   └── analytics-schema.ts
├── constants/           # Static data
│   └── model-pricing.ts
├── utils/               # Pure functions
│   ├── cost-calculator.ts
│   └── id-generator.ts
├── types/               # TypeScript types
│   └── index.ts
└── index.ts             # Public exports
```

### SDK Structure (packages/sdk)
```
src/
├── providers/           # Provider-specific interceptors
│   ├── openai-interceptor.ts
│   ├── anthropic-interceptor.ts
│   ├── gemini-interceptor.ts
│   ├── error-classifier.ts        # Shared error classification
│   ├── shared-event-builder.ts    # Unified event construction (NEW)
│   └── streaming-helpers.ts       # Stream handling utilities
├── transport/           # Event batching
│   └── event-batcher.ts
├── utils/               # Helpers
│   └── detect-provider.ts
├── profiler-wrapper.ts  # Main API
└── index.ts             # Public exports
```

### Server Structure (apps/server)
```
src/
├── db/                              # Database layer
│   ├── schema.ts                    # Drizzle schema
│   └── connection.ts                # DB client
├── lib/                             # Infrastructure
│   └── redis.ts                     # Redis client & keys
├── middleware/                      # Express middleware
│   ├── request-validator.ts         # Zod validation
│   ├── error-handler.ts             # Error handling (no query logging)
│   └── rate-limiter.ts              # Fixed-window limiter (atomic)
├── routes/                          # API routes
│   ├── event-routes.ts              # Event ingestion
│   ├── analytics-routes.ts          # Analytics queries
│   ├── stream-routes.ts             # SSE streaming
│   └── export-routes.ts             # CSV/JSON export
├── services/                        # Business logic
│   ├── event-processor.ts           # Event storage
│   ├── analytics-service.ts         # Re-exports (backward compat)
│   ├── cost-breakdown-service.ts    # Cost breakdown logic (max 500)
│   ├── flamegraph-service.ts        # Flamegraph aggregation
│   ├── timeseries-service.ts        # Time-series logic (max 1000)
│   ├── sse-manager.ts               # SSE connection mgmt
│   ├── prompt-similarity-service.ts # Prompt embeddings
│   └── types/                       # Type definitions (NEW)
│       └── analytics-query-result-types.ts # Typed query results
├── utils/                           # Utilities
│   └── pagination.ts                # Cursor pagination
├── app.ts                           # Express app factory
└── index.ts                         # Entry point
```

### Web Structure (apps/web)
```
src/
├── app/                 # Next.js App Router
│   ├── (dashboard)/     # Dashboard routes
│   │   ├── overview/
│   │   ├── features/
│   │   ├── flamegraph/
│   │   ├── prompts/
│   │   └── realtime/
│   └── layout.tsx
├── components/          # React components
│   ├── layout/          # Layout components
│   ├── charts/          # Chart components
│   ├── ui/              # shadcn/ui primitives
│   └── providers/       # Context providers
└── lib/                 # Client utilities
    ├── api-client.ts
    └── utils.ts
```

## TypeScript Standards

### Strict Mode
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Type Definitions
- Prefer `interface` for public APIs, `type` for unions/intersections
- Use `readonly` for immutable data
- Avoid `any`, use `unknown` for truly dynamic types
- Export types from `types/index.ts`

### Module Format
- **ESM only**: `.js` extensions in imports
- Top-level `await` allowed
- No CommonJS

## Error Handling

### SDK Error Classification
```typescript
// Unified error classification across OpenAI/Anthropic/Gemini
import { classifyApiError } from './providers/error-classifier.js';

try {
  const response = await openai.chat.completions.create({...});
} catch (error) {
  const errorCode = classifyApiError(error);
  // Returns: 'rate_limit' | 'timeout' | 'server_error' | 'invalid_request' | 'unknown_error'
}
```

**Error Classification Map**:
- `rate_limit`: HTTP 429 (OpenAI), RESOURCE_EXHAUSTED (Gemini)
- `timeout`: ETIMEDOUT, 'timeout' in message, DEADLINE_EXCEEDED (Gemini)
- `server_error`: HTTP 500+, UNAVAILABLE (Gemini)
- `invalid_request`: HTTP 400/401/403, INVALID_ARGUMENT (Gemini)
- `unknown_error`: Default fallback

### Server Error Handling
```typescript
// Global error middleware with logging
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path, method: req.method }, 'Request failed');
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: err.code
  });
});
```

### Web Error Handling
```typescript
// TanStack Query + exponential backoff for SSE reconnection
const { data, error } = useQuery({
  queryKey: ['analytics', 'cost-breakdown'],
  queryFn: () => fetchCostBreakdown(),
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
});
```

## Testing Standards

### Test Organization
- **Location**: `__tests__/` directory or `*.test.ts` sibling
- **Runner**: Vitest 4.0
- **Coverage**: Aim for 80%+ on critical paths

### Test Structure
```typescript
import { describe, it, expect } from 'vitest';

describe('calculateCost', () => {
  it('calculates OpenAI cost correctly', () => {
    const cost = calculateCost(10_000, MODEL_PRICING['gpt-4o']);
    expect(cost).toBeCloseTo(0.025, 6);
  });

  it('returns 0 for negative tokens', () => {
    expect(calculateCost(-100, MODEL_PRICING['gpt-4o'])).toBe(0);
  });
});
```

### Test Patterns
- **Unit**: Pure functions, utilities, schemas
- **Integration**: API routes with supertest
- **E2E**: SDK → Server flow (smoke test)

## Validation

### Zod Schemas
```typescript
import { z } from 'zod';

export const EventSchema = z.object({
  id: z.string().min(1),
  feature: z.string(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalCost: z.number().nonnegative(),
  latency: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});
```

### Validation Middleware
```typescript
export function validateRequest(schema: z.ZodSchema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors });
    }
    req.body = result.data;
    next();
  };
}
```

## Database Standards

### SQL Safety (Parameterized Queries)
```typescript
// All Drizzle queries are parameterized - prevents SQL injection
const results = await db
  .select()
  .from(events)
  .where(
    and(
      gte(events.createdAt, new Date(from)),
      lte(events.createdAt, new Date(to)),
      eq(events.feature, feature)  // Parameterized
    )
  );

// For raw SQL, use whitelist guards (GRANULARITY_VALUES)
const GRANULARITY_VALUES = ['hour', 'day', 'week'] as const;
if (!GRANULARITY_VALUES.includes(granularity)) {
  throw new Error('Invalid granularity');
}
const result = await db.execute(
  sql`SELECT ... GROUP BY DATE_TRUNC('${sql.raw(granularity)}', created_at)`
);
```

### Drizzle ORM
```typescript
import { pgTable, text, integer, numeric, timestamp } from 'drizzle-orm/pg-core';

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

### Indexes
```typescript
// Add indexes for query performance
export const eventsCreatedAtIdIdx = index('events_created_at_id_idx').on(events.createdAt, events.id);
export const eventsFeatureIdx = index('events_feature_idx').on(events.feature);
export const eventsModelIdx = index('events_model_idx').on(events.model);
export const eventsProviderIdx = index('events_provider_idx').on(events.provider);
export const eventsFeatureTimeIdx = index('events_feature_time_idx').on(events.feature, events.createdAt);
export const eventsUserTimeIdx = index('events_user_time_idx').on(events.userId, events.createdAt);
export const eventsTraceIdIdx = index('events_trace_id_idx').on(events.traceId);
export const eventsProjectIdIdx = index('events_project_id_idx').on(events.projectId);
export const eventsCreatedAtIdx = index('events_created_at_idx').on(events.createdAt);
```

## Logging

### Pino Logger (Server)
```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined,
});

// Usage
logger.info({ userId, feature }, 'Processing event');
logger.error({ err, eventId }, 'Event processing failed');
```

## Performance Guidelines

### SDK
- **Batching**: Max 10 events or 5s interval (reduces HTTP by 10x)
- **Non-blocking**: Async event transmission, no await required
- **Lightweight**: < 1ms overhead per call, < 5KB bundle
- **Shared event builder**: `buildSuccessEvent()` and `buildErrorEvent()` eliminate code duplication
- **Stream optimization**: Anthropic emits single event at completion (not per-delta)
- **Error callbacks**: Mid-stream errors trigger immediately without waiting for batch
- **All providers**: OpenAI, Anthropic, Gemini with consistent error classification

### Server
- **Connection pooling**: Drizzle + PostgreSQL for sustainable throughput
- **Atomic operations**: Redis MULTI/EXPIRE NX pipeline (prevents orphaned keys, no TOCTOU)
- **CORS enforcement**: Rejects unknown origins in production (env: `CORS_ORIGIN`)
- **Response compression**: Gzip enabled for all responses
- **Request timeout**: 30 seconds enforced globally
- **Error logging**: No query parameters logged (prevents sensitive data leakage)
- **SSE limits**: Max 100 concurrent connections (503 if exceeded)
- **Analytics limits**: Cost breakdown max 500 rows, timeseries max 1000 rows
- **Export limits**: Max 10,000 rows per request with truncation indicator headers
- **Rate limiting**: Fixed-window atomic Redis operations (no TOCTOU race)
- **Service modularity**: Split analytics into 3 focused services with backward-compatible re-exports
- **Type safety**: Typed DB query results eliminate all `any` casts
- **Query performance**: Comprehensive indexes on feature/model/provider/createdAt for fast lookups

### Web
- **Code splitting**: Next.js automatic, lazy-loaded charts
- **Component memoization**: `React.memo` for chart components to prevent re-renders
- **Data memoization**: `useMemo` for expensive data transforms
- **Client caching**: TanStack Query (5min stale time)
- **Time range refresh**: Auto-updated every 60 seconds on client
- **SSE reconnection**: Exponential backoff (max 10 retries, 1s→30s cap)
- **Export UX**: Non-blocking inline toast (not alert)
- **SSE snapshot**: Server sends current total cost on connect

## Security Practices

### Input Validation
```typescript
// All API inputs validated via Zod schemas
import { validateQuery, validateRequest } from './middleware/request-validator.js';

router.post('/events', validateRequest(EventSchema), async (req, res) => {
  // req.body is type-safe after validation
  const { feature, model, inputTokens } = req.body;
});

// Date range validation enforced (from < to)
const result = await db.execute(sql`
  WHERE created_at >= ${from} AND created_at <= ${to}
`);
```

### SQL Injection Prevention
```typescript
// All Drizzle queries are parameterized automatically
// Never use string interpolation for user input
const safeQuery = db.select().from(events).where(eq(events.id, userId)); // GOOD

// For raw SQL, whitelist guard enum values
const GROUP_BY_COLUMNS = { feature: 'feature', model: 'model', provider: 'provider' };
const groupColumn = GROUP_BY_COLUMNS[groupBy];
if (!groupColumn) {
  throw new Error('Invalid groupBy');
}
// Only then use sql.raw()
const result = await db.execute(
  sql`SELECT ... GROUP BY ${sql.raw(groupColumn)}`
);

// Granularity values also whitelist-guarded
const GRANULARITY_VALUES = { hour: 'hour', day: 'day', week: 'week' };
const safeGranularity = GRANULARITY_VALUES[granularity];
if (!safeGranularity) {
  throw new Error('Invalid granularity');
}
```

### Rate Limiting
```typescript
// Atomic Redis pipeline prevents race conditions
const rateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 100,
});

app.post('/api/v1/events', rateLimiter, async (req, res) => {
  // Enforced with atomic MULTI/EXPIRE NX
});
```

### Error Handling Security
```typescript
// Error handler does NOT log query parameters
logger.error({
  err,
  method: req.method,
  path: req.path,  // Only path, not query params
}, 'Request error');

// Does not expose stack traces in production
res.status(statusCode).json({
  error: err.message,
  ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
});
```

### Middleware
```typescript
app.use(helmet({
  contentSecurityPolicy: false, // Allow SSE
}));

app.use(compression()); // Response compression enabled

app.use(cors({
  origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000'),
  credentials: true,
}));

app.use((req, _res, next) => {
  req.setTimeout(30_000); // 30 second request timeout
  next();
});

// XSS prevention via React auto-escaping
// All user data displayed in JSX is automatically escaped
```

## Build & Deploy

### Build Order (Turborepo)
```
shared → sdk → server → web
```

### Build Commands
```bash
npx turbo build   # Build all packages
npx turbo dev     # Run dev servers
npx turbo test    # Run all tests
npx turbo lint    # Lint all packages
```

### Environment Variables
- **Never commit**: `.env` files (use `.env.example`)
- **Validation**: Validate on startup
- **Secrets**: Use proper secret management in production

## Documentation

### JSDoc Comments
```typescript
/**
 * Calculates the total cost of an LLM API call
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param pricing - Model pricing configuration
 * @returns Total cost in USD
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing
): number {
  // Implementation
}
```

### README Files
- Each package has a `README.md`
- Include: Purpose, API, Examples, Testing

## Git Practices

### Commit Messages
```
feat: add flamegraph visualization
fix: prevent negative token counts
refactor: extract event batching logic
test: add analytics service tests
docs: update API endpoint documentation
```

### Branch Strategy
- `main` - Production-ready code
- Feature branches for development
- Squash merge to main
