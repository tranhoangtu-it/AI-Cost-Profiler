# Phase 5: Integration & Wiring

## Context Links
- [System Architecture](../../docs/system-architecture.md)
- [Plan Overview](./plan.md)

## Parallelization Info
- **Depends on:** ALL previous phases (1, 2a, 2b, 3a, 3b, 4a, 4b)
- **Blocks:** Phase 6 (Testing)
- **Parallel with:** None (integration requires all pieces)

## Overview
- **Priority:** P1
- **Status:** Complete
- **Est:** 4h

Wire everything end-to-end: SDK -> Server -> DB -> Dashboard. Create seed data script. Configure Docker Compose for full-stack dev. Smoke test the complete flow.

## Key Insights
- Seed script generates realistic demo data (multiple features, models, users)
- `.env` needs both server and web URLs configured
- CORS must allow Next.js origin
- Turbo `dev` should start both apps + watch shared/sdk packages

## Requirements
### Functional
- SDK sends events to running server
- Server stores events in Postgres, updates Redis
- Dashboard fetches and renders analytics data
- SSE streams updates to dashboard in real-time
- Seed script populates 500+ demo events across 5 features

### Non-Functional
- Full-stack startup with single `turbo dev` command
- Docker Compose starts all infra deps
- `.env.example` documents all required vars

## Architecture
```
scripts/
├── seed-demo-data.ts       # Generate + insert demo events
└── test-sdk-flow.ts        # Quick SDK -> Server smoke test
```

Wiring edits to existing files (minimal, non-breaking):
- `.env.example` - add NEXT_PUBLIC_API_URL
- `turbo.json` - ensure dev task dependencies correct
- `apps/web/.env.local` creation guidance

## File Ownership (Exclusive)
```
scripts/seed-demo-data.ts
scripts/test-sdk-flow.ts
```

**Cross-cutting edits** (append-only, clearly marked):
- `.env.example` - add web-specific vars
- Root `package.json` - add `seed` script

## Implementation Steps

### 1. Create scripts/seed-demo-data.ts
```typescript
/**
 * Seed script: generates realistic demo data for the dashboard.
 * Run: pnpm tsx scripts/seed-demo-data.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../apps/server/src/db/schema.js';
import {
  generateTraceId, generateSpanId, calculateCost,
} from '../packages/shared/src/index.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const FEATURES = ['chat-summary', 'search-query', 'content-classify', 'email-draft', 'code-review'];
const MODELS_OPENAI = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];
const MODELS_ANTHROPIC = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'];
const USERS = ['user-001', 'user-002', 'user-003', 'user-004', 'user-005'];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function seed() {
  console.log('Seeding demo data...');

  const events = [];
  const now = Date.now();
  const HOURS_BACK = 72; // 3 days of data

  for (let i = 0; i < 600; i++) {
    const feature = randomChoice(FEATURES);
    const isOpenAI = Math.random() > 0.4;
    const model = isOpenAI ? randomChoice(MODELS_OPENAI) : randomChoice(MODELS_ANTHROPIC);
    const provider = isOpenAI ? 'openai' : 'anthropic';
    const inputTokens = randomInt(100, 8000);
    const outputTokens = randomInt(50, 2000);
    const latencyMs = randomInt(200, 5000);
    const cost = calculateCost(model, inputTokens, outputTokens);
    const timestamp = new Date(now - randomInt(0, HOURS_BACK * 3600 * 1000));

    events.push({
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      projectId: 'default',
      feature,
      userId: randomChoice(USERS),
      provider,
      model,
      inputTokens,
      outputTokens,
      cachedTokens: Math.random() > 0.8 ? randomInt(50, 500) : 0,
      latencyMs,
      estimatedCostUsd: String(cost),
      verifiedCostUsd: String(cost),
      isCacheHit: false,
      metadata: null,
      createdAt: timestamp,
    });
  }

  // Batch insert in chunks of 100
  for (let i = 0; i < events.length; i += 100) {
    const chunk = events.slice(i, i + 100);
    await db.insert(schema.events).values(chunk);
    console.log(`Inserted ${Math.min(i + 100, events.length)} / ${events.length} events`);
  }

  console.log('Seeding complete!');
  await pool.end();
}

seed().catch(console.error);
```

### 2. Create scripts/test-sdk-flow.ts
```typescript
/**
 * Smoke test: SDK -> Server flow.
 * Run: pnpm tsx scripts/test-sdk-flow.ts
 *
 * Requires: server running on localhost:3100
 */
import {
  generateTraceId, generateSpanId, calculateCost,
  type LlmEvent,
} from '../packages/shared/src/index.js';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3100';

async function testFlow() {
  console.log('Testing SDK -> Server flow...');

  // 1. Health check
  const health = await fetch(`${SERVER_URL}/health`);
  console.log('Health:', await health.json());

  // 2. Send batch of events
  const events: LlmEvent[] = Array.from({ length: 5 }, (_, i) => ({
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    feature: 'test-feature',
    userId: 'test-user',
    provider: 'openai' as const,
    model: 'gpt-4o',
    inputTokens: 500 + i * 100,
    outputTokens: 200 + i * 50,
    cachedTokens: 0,
    latencyMs: 1000 + i * 200,
    estimatedCostUsd: calculateCost('gpt-4o', 500 + i * 100, 200 + i * 50),
    timestamp: new Date().toISOString(),
  }));

  const res = await fetch(`${SERVER_URL}/api/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  console.log('Ingest response:', res.status, await res.json());

  // 3. Query analytics
  const from = new Date(Date.now() - 3600_000).toISOString();
  const to = new Date().toISOString();

  const breakdown = await fetch(
    `${SERVER_URL}/api/v1/analytics/cost-breakdown?from=${from}&to=${to}&groupBy=feature`,
  );
  console.log('Cost breakdown:', await breakdown.json());

  const flamegraph = await fetch(
    `${SERVER_URL}/api/v1/analytics/flamegraph?from=${from}&to=${to}`,
  );
  console.log('Flamegraph:', await flamegraph.json());

  console.log('Smoke test complete!');
}

testFlow().catch(console.error);
```

### 3. Update .env.example
Add to existing:
```
# Web (Next.js)
NEXT_PUBLIC_API_URL=http://localhost:3100

# CORS
CORS_ORIGIN=http://localhost:3000
```

### 4. Update root package.json scripts
Add:
```json
{
  "scripts": {
    "seed": "tsx scripts/seed-demo-data.ts",
    "test:smoke": "tsx scripts/test-sdk-flow.ts"
  }
}
```

### 5. Full-Stack Dev Startup Procedure
Document in `scripts/` or root README:
```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install deps
pnpm install

# 3. Build shared + SDK
turbo build --filter @ai-cost-profiler/shared --filter @ai-cost-profiler/sdk

# 4. Push DB schema
cd apps/server && pnpm db:push && cd ../..

# 5. Seed demo data
pnpm seed

# 6. Start dev servers (server + web)
turbo dev
```

### 6. Verify end-to-end
1. Dashboard at `http://localhost:3000` shows seeded data
2. Cost Overview: line chart + pie chart populated
3. Feature Breakdown: treemap shows 5 features
4. Flamegraph: hierarchical view renders
5. Prompt Inspector: bloat scores calculated
6. Real-time: SSE connects (send events via smoke test to see updates)

## Todo List
- [x] Create `scripts/seed-demo-data.ts`
- [x] Create `scripts/test-sdk-flow.ts`
- [x] Update `.env.example` with web vars
- [x] Update root `package.json` with seed/smoke scripts
- [x] Run full startup procedure
- [x] Verify Cost Overview page with seeded data
- [x] Verify Feature Breakdown page
- [x] Verify Flamegraph page
- [x] Verify Prompt Inspector page
- [x] Verify Real-time Feed (send test events)
- [x] Fix any CORS/connection issues

## Success Criteria
- `docker compose up -d && pnpm seed && turbo dev` results in working full-stack app
- Dashboard renders charts with seeded data
- `pnpm test:smoke` passes all checks
- SSE streaming works end-to-end
- No console errors in browser or server

## Conflict Prevention
Phase 5 creates only `scripts/` files. Cross-cutting edits to `.env.example` and root `package.json` are append-only (no removals/overwrites of existing lines).

## Risk Assessment
- **Port conflicts:** Server 3100, Web 3000. Document in `.env.example`
- **Build order:** Must build shared + SDK before server dev
- **CORS mismatch:** Ensure `CORS_ORIGIN` matches Next.js dev URL exactly

## Security
- Seed script for dev only; no production data
- `.env.local` in `.gitignore`

## Next Steps
Phase 6 (Testing) adds automated test coverage.
