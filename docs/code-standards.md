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
│   └── anthropic-interceptor.ts
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
├── db/                  # Database layer
│   ├── schema.ts        # Drizzle schema
│   └── connection.ts    # DB client
├── lib/                 # Infrastructure
│   └── redis.ts
├── middleware/          # Express middleware
│   ├── request-validator.ts
│   └── error-handler.ts
├── routes/              # API routes
│   ├── event-routes.ts
│   ├── analytics-routes.ts
│   └── stream-routes.ts
├── services/            # Business logic
│   ├── event-processor.ts
│   ├── analytics-service.ts
│   └── sse-manager.ts
├── app.ts               # Express app factory
└── index.ts             # Entry point
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

### SDK
```typescript
// Return error objects, don't throw
export function calculateCost(tokens: number, pricing: ModelPricing): number {
  if (tokens < 0) return 0;
  return (tokens / 1_000_000) * pricing.inputPer1M;
}
```

### Server
```typescript
// Use Express error middleware
app.use((err, req, res, next) => {
  logger.error({ err, req }, 'Request failed');
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});
```

### Web
```typescript
// TanStack Query handles errors
const { data, error } = useQuery({
  queryKey: ['analytics', 'cost-breakdown'],
  queryFn: () => fetchCostBreakdown(),
  retry: 3,
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
export const eventsFeatureIdx = index('events_feature_idx').on(events.feature);
export const eventsModelIdx = index('events_model_idx').on(events.model);
export const eventsTimestampIdx = index('events_timestamp_idx').on(events.timestamp);
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
- **Batching**: Max 10 events or 5s interval
- **No blocking**: Async event transmission
- **Lightweight**: < 1ms overhead per call

### Server
- **Connection pooling**: Drizzle + PostgreSQL
- **Redis caching**: TTL for analytics queries
- **SSE**: Redis pub/sub for horizontal scaling

### Web
- **Code splitting**: Next.js automatic
- **Client caching**: TanStack Query (5min stale time)
- **Lazy loading**: Dynamic imports for charts

## Security Practices

### Input Validation
- All API inputs validated via Zod schemas
- SQL injection prevented by Drizzle parameterization
- XSS prevention via React auto-escaping

### Middleware
```typescript
app.use(helmet({
  contentSecurityPolicy: false, // Allow SSE
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
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
