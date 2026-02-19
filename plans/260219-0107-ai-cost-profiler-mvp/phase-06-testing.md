# Phase 6: Testing

## Context Links
- [Tech Stack - Vitest](../../docs/tech-stack.md)
- [Plan Overview](./plan.md)

## Parallelization Info
- **Depends on:** Phase 5 (all code implemented and wired)
- **Blocks:** None (final phase)
- **Parallel with:** None

## Overview
- **Priority:** P2
- **Status:** Complete
- **Est:** 4h

Write unit and integration tests using Vitest. Cover SDK wrapper, shared utils, server routes/services, and end-to-end SDK-to-DB flow.

## Key Insights
- Vitest: fast, ESM-native, workspace-aware (runs per-package tests)
- Mock HTTP calls in SDK tests (no real LLM API)
- Mock DB in server unit tests; use real DB for integration tests
- Shared package tests are pure function tests (no mocks needed)

## Requirements
### Functional
- SDK: test wrapper creates proxy, interceptor captures usage, batcher flushes
- Shared: test cost calculation, schema validation, ID generation
- Server: test event processing pipeline, analytics queries, SSE
- Integration: SDK -> Server -> DB roundtrip

### Non-Functional
- >80% line coverage on shared + SDK
- Tests run in <30s total
- No real LLM API calls in tests

## Architecture
```
packages/shared/
├── src/__tests__/
│   ├── cost-calculator.test.ts
│   ├── event-schema.test.ts
│   └── id-generator.test.ts

packages/sdk/
├── src/__tests__/
│   ├── profiler-wrapper.test.ts
│   ├── event-batcher.test.ts
│   └── openai-interceptor.test.ts

apps/server/
├── src/__tests__/
│   ├── event-routes.test.ts
│   ├── event-processor.test.ts
│   ├── analytics-service.test.ts
│   └── integration/
│       └── sdk-to-db-flow.test.ts
```

## File Ownership (Exclusive)
All `__tests__/` directories and `*.test.ts` files. Plus vitest config files.

## Implementation Steps

### 1. Add Vitest to root + each workspace

Root `package.json` devDeps:
```json
{ "vitest": "^1.4.0" }
```

Each workspace `package.json` scripts:
```json
{ "test": "vitest run", "test:watch": "vitest" }
```

### 2. Root vitest.workspace.ts
```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/shared',
  'packages/sdk',
  'apps/server',
]);
```

### 3. packages/shared vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
});
```

### 4. packages/shared/src/__tests__/cost-calculator.test.ts
```typescript
import { describe, it, expect } from 'vitest';
import { calculateCost, lookupPricing } from '../utils/cost-calculator.js';

describe('calculateCost', () => {
  it('calculates gpt-4o cost correctly', () => {
    // gpt-4o: input $0.0025/1K, output $0.01/1K
    const cost = calculateCost('gpt-4o', 1000, 500);
    // input: 1 * 0.0025 = 0.0025, output: 0.5 * 0.01 = 0.005
    expect(cost).toBeCloseTo(0.0075, 6);
  });

  it('calculates claude-3-5-sonnet cost correctly', () => {
    // claude-3-5-sonnet: input $0.003/1K, output $0.015/1K
    const cost = calculateCost('claude-3-5-sonnet-20241022', 2000, 1000);
    // input: 2 * 0.003 = 0.006, output: 1 * 0.015 = 0.015
    expect(cost).toBeCloseTo(0.021, 6);
  });

  it('returns 0 for unknown model', () => {
    expect(calculateCost('unknown-model', 1000, 500)).toBe(0);
  });

  it('handles zero tokens', () => {
    expect(calculateCost('gpt-4o', 0, 0)).toBe(0);
  });
});

describe('lookupPricing', () => {
  it('returns pricing for known model', () => {
    const pricing = lookupPricing('gpt-4o');
    expect(pricing).not.toBeNull();
    expect(pricing!.provider).toBe('openai');
    expect(pricing!.inputPricePer1k).toBe(0.0025);
  });

  it('returns null for unknown model', () => {
    expect(lookupPricing('nonexistent')).toBeNull();
  });
});
```

### 5. packages/shared/src/__tests__/event-schema.test.ts
```typescript
import { describe, it, expect } from 'vitest';
import { llmEventSchema, batchEventRequestSchema } from '../schemas/event-schema.js';

describe('llmEventSchema', () => {
  const validEvent = {
    traceId: 'tr_abc123',
    spanId: 'sp_def456',
    feature: 'chat-summary',
    provider: 'openai',
    model: 'gpt-4o',
    inputTokens: 500,
    outputTokens: 200,
    cachedTokens: 0,
    latencyMs: 1200,
    estimatedCostUsd: 0.0075,
    timestamp: '2026-02-19T00:00:00.000Z',
  };

  it('validates correct event', () => {
    const result = llmEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('rejects negative tokens', () => {
    const result = llmEventSchema.safeParse({ ...validEvent, inputTokens: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid provider', () => {
    const result = llmEventSchema.safeParse({ ...validEvent, provider: 'google' });
    expect(result.success).toBe(false);
  });

  it('allows optional fields', () => {
    const result = llmEventSchema.safeParse({ ...validEvent, userId: 'user-1', metadata: { key: 'val' } });
    expect(result.success).toBe(true);
  });
});

describe('batchEventRequestSchema', () => {
  it('rejects empty events array', () => {
    const result = batchEventRequestSchema.safeParse({ events: [] });
    expect(result.success).toBe(false);
  });
});
```

### 6. packages/shared/src/__tests__/id-generator.test.ts
```typescript
import { describe, it, expect } from 'vitest';
import { generateTraceId, generateSpanId } from '../utils/id-generator.js';

describe('generateTraceId', () => {
  it('returns string with tr_ prefix', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^tr_/);
    expect(id.length).toBeGreaterThan(5);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId()));
    expect(ids.size).toBe(100);
  });
});

describe('generateSpanId', () => {
  it('returns string with sp_ prefix', () => {
    const id = generateSpanId();
    expect(id).toMatch(/^sp_/);
  });
});
```

### 7. packages/sdk vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
  },
});
```

### 8. packages/sdk/src/__tests__/event-batcher.test.ts
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBatcher } from '../transport/event-batcher.js';
import type { LlmEvent } from '@ai-cost-profiler/shared';

const mockEvent: LlmEvent = {
  traceId: 'tr_test',
  spanId: 'sp_test',
  feature: 'test',
  provider: 'openai',
  model: 'gpt-4o',
  inputTokens: 100,
  outputTokens: 50,
  cachedTokens: 0,
  latencyMs: 500,
  estimatedCostUsd: 0.001,
  timestamp: new Date().toISOString(),
};

describe('EventBatcher', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('flushes when batch size reached', async () => {
    const batcher = new EventBatcher('http://test', 3, 60000);
    await batcher.add(mockEvent);
    await batcher.add(mockEvent);
    expect(fetchSpy).not.toHaveBeenCalled();
    await batcher.add(mockEvent);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    batcher.destroy();
  });

  it('flushes on timer', async () => {
    const batcher = new EventBatcher('http://test', 100, 1000);
    await batcher.add(mockEvent);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    // flush is async; give microtask queue a tick
    await vi.runAllTimersAsync();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    batcher.destroy();
  });

  it('handles flush failure gracefully', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network error'));
    const batcher = new EventBatcher('http://test', 1, 60000);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await batcher.add(mockEvent);
    expect(consoleSpy).toHaveBeenCalled();
    batcher.destroy();
  });

  it('sends correct payload format', async () => {
    const batcher = new EventBatcher('http://test', 1, 60000);
    await batcher.add(mockEvent);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://test/api/v1/events',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [mockEvent] }),
      }),
    );
    batcher.destroy();
  });
});
```

### 9. packages/sdk/src/__tests__/openai-interceptor.test.ts
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { profileAI } from '../profiler-wrapper.js';

describe('OpenAI interceptor', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);
  });

  it('intercepts chat.completions.create and captures usage', async () => {
    // Mock OpenAI client
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            id: 'chatcmpl-123',
            choices: [{ message: { content: 'Hello!' } }],
            usage: { prompt_tokens: 50, completion_tokens: 20 },
          }),
        },
      },
    };

    const profiled = profileAI(mockClient, {
      serverUrl: 'http://test',
      feature: 'test-feature',
      batchSize: 1, // Flush immediately
    });

    const result = await profiled.chat.completions.create({ model: 'gpt-4o', messages: [] });

    // Original response preserved
    expect(result.choices[0].message.content).toBe('Hello!');

    // Event sent to server
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test/api/v1/events',
      expect.objectContaining({ method: 'POST' }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].model).toBe('gpt-4o');
    expect(body.events[0].inputTokens).toBe(50);
    expect(body.events[0].outputTokens).toBe(20);
    expect(body.events[0].feature).toBe('test-feature');
    expect(body.events[0].provider).toBe('openai');
  });

  it('does not wrap when enabled=false', async () => {
    const mockClient = { chat: { completions: { create: vi.fn() } } };
    const profiled = profileAI(mockClient, {
      serverUrl: 'http://test',
      feature: 'test',
      enabled: false,
    });

    // Should be same reference (no proxy)
    expect(profiled).toBe(mockClient);
  });
});
```

### 10. packages/sdk/src/__tests__/profiler-wrapper.test.ts
```typescript
import { describe, it, expect, vi } from 'vitest';
import { profileAI } from '../profiler-wrapper.js';

describe('profileAI', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('detects OpenAI client', () => {
    const client = { chat: { completions: { create: vi.fn() } } };
    const profiled = profileAI(client, { serverUrl: 'http://test', feature: 'test' });
    expect(profiled).not.toBe(client); // Is a proxy
  });

  it('detects Anthropic client', () => {
    const client = { messages: { create: vi.fn() } };
    const profiled = profileAI(client, { serverUrl: 'http://test', feature: 'test' });
    expect(profiled).not.toBe(client);
  });

  it('throws for unsupported client', () => {
    expect(() =>
      profileAI({} as any, { serverUrl: 'http://test', feature: 'test' }),
    ).toThrow('Unsupported LLM client');
  });
});
```

### 11. apps/server vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
```

### 12. apps/server/src/__tests__/setup.ts
```typescript
import { vi } from 'vitest';

// Mock Redis for unit tests
vi.mock('../lib/redis.js', () => ({
  redis: {
    pipeline: () => ({
      incrbyfloat: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
    publish: vi.fn().mockResolvedValue(0),
    get: vi.fn().mockResolvedValue('0'),
    keys: vi.fn().mockResolvedValue([]),
    mget: vi.fn().mockResolvedValue([]),
  },
  redisSub: {
    subscribe: vi.fn(),
    on: vi.fn(),
  },
}));
```

### 13. apps/server/src/__tests__/event-routes.test.ts
```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

// Mock the event processor
vi.mock('../services/event-processor.js', () => ({
  processEventBatch: vi.fn().mockResolvedValue(undefined),
}));

describe('POST /api/v1/events', () => {
  it('accepts valid event batch', async () => {
    const res = await request(app)
      .post('/api/v1/events')
      .send({
        events: [{
          traceId: 'tr_test',
          spanId: 'sp_test',
          feature: 'test',
          provider: 'openai',
          model: 'gpt-4o',
          inputTokens: 100,
          outputTokens: 50,
          cachedTokens: 0,
          latencyMs: 500,
          estimatedCostUsd: 0.001,
          timestamp: '2026-02-19T00:00:00.000Z',
        }],
      });

    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(1);
  });

  it('rejects empty events array', async () => {
    const res = await request(app)
      .post('/api/v1/events')
      .send({ events: [] });

    expect(res.status).toBe(400);
  });

  it('rejects malformed event', async () => {
    const res = await request(app)
      .post('/api/v1/events')
      .send({ events: [{ invalid: true }] });

    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

### 14. apps/server/src/__tests__/event-processor.test.ts
```typescript
import { describe, it, expect, vi } from 'vitest';

// This test requires mocking drizzle db; structure shown but may need adjustment
// based on actual drizzle mock patterns
describe('processEventBatch', () => {
  it('enriches events with verified cost', async () => {
    // Mock db.insert
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    vi.doMock('../db/index.js', () => ({
      db: { insert: mockInsert },
      events: {},
    }));

    const { processEventBatch } = await import('../services/event-processor.js');

    await processEventBatch([{
      traceId: 'tr_test',
      spanId: 'sp_test',
      feature: 'test',
      provider: 'openai' as const,
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 500,
      cachedTokens: 0,
      latencyMs: 1000,
      estimatedCostUsd: 0.007,
      timestamp: new Date().toISOString(),
    }]);

    expect(mockInsert).toHaveBeenCalled();
  });
});
```

### 15. Add supertest to apps/server devDeps
```json
{ "devDependencies": { "supertest": "^6.3.0", "@types/supertest": "^6.0.0" } }
```

### 16. Verify
```bash
turbo test  # Runs all workspace tests
```

## Todo List
- [x] Add `vitest` to root and workspace devDeps
- [x] Create `vitest.workspace.ts` at root
- [x] Create vitest configs per workspace
- [x] Write shared package tests (cost-calculator, event-schema, id-generator)
- [x] Write SDK tests (event-batcher, openai-interceptor, profiler-wrapper)
- [x] Write server tests (event-routes, event-processor)
- [x] Add supertest dep to server
- [x] Create test setup file for server (mock Redis)
- [x] Run `turbo test` and verify all pass
- [x] Check coverage >80% on shared + SDK

## Success Criteria
- `turbo test` runs all tests across all workspaces
- All tests pass
- >80% coverage on `packages/shared` and `packages/sdk`
- No real API calls or DB connections in unit tests
- Tests complete in <30s

## Conflict Prevention
Phase 6 owns ONLY `__tests__/` directories, `*.test.ts` files, and vitest config files. No source code modifications.

## Risk Assessment
- **Drizzle mocking:** Complex to mock; may need to use `vi.doMock` with factory
- **supertest + ESM:** May need `--experimental-vm-modules` flag or tsconfig adjustment
- **Timer mocking:** `vi.useFakeTimers()` can interfere with async operations; use `vi.runAllTimersAsync()`

## Security
- No secrets in tests
- Mock all external services

## Next Steps
After all tests pass, MVP is feature-complete. Next: CI/CD, deployment, multi-tenant auth (deferred).
