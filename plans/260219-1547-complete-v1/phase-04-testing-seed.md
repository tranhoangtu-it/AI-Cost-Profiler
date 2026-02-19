---
phase: 4
title: "Testing & Seed - Frontend Tests, Improved Seed, Integration"
status: pending
effort: 18h
dependencies: [1, 2, 3]
---

# Phase 4: Testing & Seed

## Overview

Comprehensive test suite for frontend components/hooks, improved seed data covering all 3 providers with realistic patterns, and integration tests.

**Priority:** P1 (quality assurance)
**Effort:** 18h
**Parallelizable:** No (depends on all previous phases)

## Context Links

- Research: `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/plans/reports/researcher-260219-1543-sdk-testing-improvements.md`
- MVP Phase 6: `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/plans/260219-0107-ai-cost-profiler-mvp/phase-06-testing.md`
- Code Standards: `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/docs/code-standards.md`

## Key Insights

- Frontend tests should use Vitest + Testing Library (React)
- Mock API calls with MSW (Mock Service Worker)
- Seed data should cover: all 3 providers, streaming + non-streaming, errors, cached tokens
- Integration tests verify SDK → Backend → Frontend flow
- Coverage targets: SDK 90%+, Backend 80%+, Frontend 80%+

## Requirements

### Functional
1. **Frontend Unit Tests**: Component rendering, user interactions, hooks
2. **SDK Integration Tests**: Mocked HTTP responses for all providers
3. **Improved Seed Data**: Realistic patterns (streaming, errors, cache hits)
4. **E2E Tests**: Full flow from SDK call to dashboard update (optional)

### Non-Functional
- Test execution <30s for unit tests
- Coverage reports generated on every test run
- Seed script runs in <10s
- Integration tests use disposable test database

## Architecture

### Test Structure

```
apps/web/
  src/
    components/
      __tests__/
        export-button.test.tsx
        cached-tokens-card.test.tsx
    hooks/
      __tests__/
        use-paginated-data.test.ts
        use-export.test.ts

packages/sdk/
  src/
    __tests__/
      openai-streaming.test.ts
      gemini-interceptor.test.ts
      error-tracking.test.ts

apps/server/
  src/
    __tests__/
      pagination.test.ts
      rate-limiter.test.ts
      similarity-service.test.ts
```

### Seed Data Coverage

```ts
// Seed data should include:
- 3 providers × 5 models = 15 model variants
- 80% non-streaming, 20% streaming
- 95% success, 5% errors (rate limit, timeout, server error)
- 30% cache hits (Anthropic/OpenAI only)
- 10 features with varying costs
- 100 prompts with realistic similarity clusters
- Date range: last 30 days, hourly distribution
```

## Related Code Files

### To Create
- `apps/web/vitest.config.ts` - Vitest config for frontend tests
- `apps/web/src/test-utils/test-wrapper.tsx` - Provider wrapper for tests
- `apps/web/src/__tests__/setup.ts` - Global test setup (MSW)
- `apps/web/src/components/__tests__/export-button.test.tsx`
- `apps/web/src/components/__tests__/cached-tokens-card.test.tsx`
- `apps/web/src/hooks/__tests__/use-paginated-data.test.ts`
- `apps/web/src/hooks/__tests__/use-export.test.ts`
- `packages/sdk/src/__tests__/openai-streaming.test.ts`
- `packages/sdk/src/__tests__/gemini-interceptor.test.ts`
- `packages/sdk/src/__tests__/error-tracking.test.ts`
- `apps/server/src/__tests__/pagination.test.ts`
- `apps/server/src/__tests__/rate-limiter.test.ts`
- `apps/server/src/__tests__/similarity-service.test.ts`
- `scripts/seed-data-v2.ts` - Enhanced seed script

### To Modify
- `package.json` (root) - Add test scripts: `turbo test`, `turbo test:coverage`
- `apps/web/package.json` - Add testing dependencies

## Implementation Steps

### 1. Frontend Test Setup (2h)

**File:** `apps/web/vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '.next/', 'dist/']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
```

**File:** `apps/web/src/__tests__/setup.ts`

```ts
import { expect, afterEach, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { server } from './mocks/server';

expect.extend(matchers);

beforeAll(() => server.listen());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
```

**File:** `apps/web/src/__tests__/mocks/server.ts`

```ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/analytics/overview', () => {
    return HttpResponse.json({
      data: { totalCost: 123.45, totalTokens: 100000 },
      pagination: { nextCursor: null, hasMore: false }
    });
  }),

  http.get('/api/export/events', () => {
    return HttpResponse.text('id,timestamp,cost\n1,2024-01-01,10.00', {
      headers: { 'Content-Type': 'text/csv' }
    });
  })
];

export const server = setupServer(...handlers);
```

**Install dependencies:**
```bash
cd apps/web
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event msw
```

### 2. Component Tests (4h)

**File:** `apps/web/src/components/__tests__/export-button.test.tsx`

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportButton } from '../export-button';
import { server } from '../../__tests__/mocks/server';
import { http, HttpResponse } from 'msw';

describe('ExportButton', () => {
  it('renders export button', () => {
    render(<ExportButton endpoint="/events" filename="test" />);
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('downloads CSV on click', async () => {
    const user = userEvent.setup();

    // Mock blob download
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.createObjectURL = createObjectURL;

    render(<ExportButton endpoint="/events" filename="test" />);

    await user.click(screen.getByText('Export'));
    await user.click(screen.getByText('Export as CSV'));

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
    });
  });

  it('shows loading state during export', async () => {
    server.use(
      http.get('/api/export/events', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return HttpResponse.text('data');
      })
    );

    const user = userEvent.setup();
    render(<ExportButton endpoint="/events" filename="test" />);

    await user.click(screen.getByText('Export'));
    await user.click(screen.getByText('Export as CSV'));

    expect(screen.getByText('Downloading...')).toBeInTheDocument();
  });
});
```

**File:** `apps/web/src/components/__tests__/cached-tokens-card.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { CachedTokensCard } from '../cached-tokens-card';
import { server } from '../../__tests__/mocks/server';
import { http, HttpResponse } from 'msw';

describe('CachedTokensCard', () => {
  it('displays cache metrics', async () => {
    server.use(
      http.get('/api/analytics/cache-metrics', () => {
        return HttpResponse.json({
          data: [{
            totalInputTokens: 100000,
            cachedInputTokens: 30000,
            cacheHitRate: 0.3,
            costSavings: 12.50
          }],
          pagination: { nextCursor: null, hasMore: false }
        });
      })
    );

    render(<CachedTokensCard />);

    expect(await screen.findByText('30.0%')).toBeInTheDocument();
    expect(screen.getByText('$12.50')).toBeInTheDocument();
  });

  it('shows skeleton during loading', () => {
    render(<CachedTokensCard />);
    // Skeleton component should render
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});
```

### 3. Hook Tests (3h)

**File:** `apps/web/src/hooks/__tests__/use-paginated-data.test.ts`

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { usePaginatedData } from '../use-paginated-data';
import { server } from '../../__tests__/mocks/server';
import { http, HttpResponse } from 'msw';

describe('usePaginatedData', () => {
  it('fetches data with pagination', async () => {
    server.use(
      http.get('/api/analytics/events', ({ request }) => {
        const url = new URL(request.url);
        const cursor = url.searchParams.get('cursor');

        if (!cursor) {
          return HttpResponse.json({
            data: [{ id: '1' }, { id: '2' }],
            pagination: { nextCursor: 'cursor123', hasMore: true }
          });
        } else {
          return HttpResponse.json({
            data: [{ id: '3' }],
            pagination: { nextCursor: null, hasMore: false }
          });
        }
      })
    );

    const { result } = renderHook(() => usePaginatedData('/analytics/events'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);
  });

  it('applies date range filter', async () => {
    server.use(
      http.get('/api/analytics/events', ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('startDate')).toBeTruthy();
        expect(url.searchParams.get('endDate')).toBeTruthy();

        return HttpResponse.json({
          data: [],
          pagination: { nextCursor: null, hasMore: false }
        });
      })
    );

    const { result } = renderHook(() => usePaginatedData('/analytics/events'));

    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
```

### 4. SDK Integration Tests (4h)

**File:** `packages/sdk/src/__tests__/openai-streaming.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { profileAI } from '../index';
import { EventBatcher } from '../transport/event-batcher';

describe('OpenAI Streaming', () => {
  it('captures tokens from streaming response', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn(async function* () {
            yield { choices: [{ delta: { content: 'Hello' } }] };
            yield { choices: [{ delta: { content: ' world' } }] };
            yield { usage: { prompt_tokens: 10, completion_tokens: 5 } };
          })
        }
      }
    };

    const capturedEvents: any[] = [];
    const batcher = new EventBatcher({
      apiKey: 'test',
      serverUrl: 'http://localhost',
      batchSize: 1,
      flushIntervalMs: 100
    });

    // Spy on batcher
    vi.spyOn(batcher, 'add').mockImplementation((event) => {
      capturedEvents.push(event);
    });

    const profiled = profileAI(mockClient, { apiKey: 'test', batcher });

    const stream = await profiled.chat.completions.create({ stream: true });
    for await (const chunk of stream) {
      // Consume stream
    }

    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0].inputTokens).toBe(10);
    expect(capturedEvents[0].outputTokens).toBe(5);
    expect(capturedEvents[0].isStreaming).toBe(true);
  });
});
```

**File:** `packages/sdk/src/__tests__/gemini-interceptor.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { createGeminiInterceptor } from '../providers/gemini-interceptor';

describe('Gemini Interceptor', () => {
  it('extracts tokens from generateContent response', async () => {
    const mockModel = {
      model: 'gemini-1.5-pro',
      generateContent: vi.fn().mockResolvedValue({
        response: {
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            totalTokenCount: 150
          }
        }
      })
    };

    const capturedEvents: any[] = [];
    const batcher = { add: (event: any) => capturedEvents.push(event) };

    const intercepted = createGeminiInterceptor(mockModel, {
      apiKey: 'test',
      serverUrl: 'http://localhost',
      batcher: batcher as any
    });

    await intercepted.generateContent(['test prompt']);

    expect(capturedEvents[0].inputTokens).toBe(100);
    expect(capturedEvents[0].outputTokens).toBe(50);
  });
});
```

### 5. Backend Tests (3h)

**File:** `apps/server/src/__tests__/pagination.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '../utils/pagination';

describe('Pagination', () => {
  it('encodes and decodes cursor correctly', () => {
    const cursor = { timestamp: Date.now(), id: 'abc123' };
    const encoded = encodeCursor(cursor);
    const decoded = decodeCursor(encoded);

    expect(decoded).toEqual(cursor);
  });

  it('handles base64 encoding edge cases', () => {
    const cursor = { timestamp: 0, id: '' };
    const encoded = encodeCursor(cursor);
    expect(() => decodeCursor(encoded)).not.toThrow();
  });
});
```

**File:** `apps/server/src/__tests__/rate-limiter.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { rateLimiter } from '../middleware/rate-limiter';
import type { Request, Response, NextFunction } from 'express';

describe('Rate Limiter', () => {
  it('allows requests under limit', async () => {
    const req = { ip: '127.0.0.1' } as Request;
    const res = { setHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await rateLimiter(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('blocks requests over limit', async () => {
    // Mock Redis to return count > limit
    // ... test implementation
  });
});
```

### 6. Improved Seed Data (6h)

**File:** `scripts/seed-data-v2.ts`

```ts
import { db } from '../apps/server/src/db/connection';
import { costEvents, promptEmbeddings } from '../apps/server/src/db/schema';
import { generateId } from '@repo/shared/utils/id-generator';
import { faker } from '@faker-js/faker';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODELS = {
  'openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  'anthropic': ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  'google-gemini': ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp']
};

const FEATURES = [
  'chat-completion', 'code-generation', 'summarization', 'translation',
  'content-moderation', 'semantic-search', 'question-answering',
  'data-extraction', 'sentiment-analysis', 'image-analysis'
];

const PROMPT_TEMPLATES = [
  'Summarize the following text: {content}',
  'Generate code for: {content}',
  'Translate to Spanish: {content}',
  'Answer this question: {content}',
  'Extract key entities from: {content}'
];

async function generateRealisticEvents(count: number = 1000) {
  const events = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const provider = faker.helpers.arrayElement(['openai', 'anthropic', 'google-gemini']);
    const model = faker.helpers.arrayElement(MODELS[provider]);
    const feature = faker.helpers.arrayElement(FEATURES);
    const isStreaming = Math.random() < 0.2; // 20% streaming
    const hasError = Math.random() < 0.05; // 5% errors
    const hasCachedTokens = !hasError && ['openai', 'anthropic'].includes(provider) && Math.random() < 0.3;

    const inputTokens = faker.number.int({ min: 100, max: 2000 });
    const outputTokens = hasError ? 0 : faker.number.int({ min: 50, max: 1500 });
    const cachedInputTokens = hasCachedTokens ? Math.floor(inputTokens * 0.7) : 0;

    const template = faker.helpers.arrayElement(PROMPT_TEMPLATES);
    const promptText = template.replace('{content}', faker.lorem.paragraph());

    events.push({
      id: generateId(),
      provider,
      model,
      featureName: feature,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      latencyMs: faker.number.int({ min: 200, max: 5000 }),
      cost: calculateCost(provider, model, inputTokens, outputTokens, cachedInputTokens),
      isStreaming,
      errorCode: hasError ? faker.helpers.arrayElement(['rate_limit', 'timeout', 'server_error']) : null,
      retryCount: hasError ? faker.number.int({ min: 1, max: 3 }) : 0,
      promptText,
      responseText: hasError ? null : faker.lorem.paragraphs(2),
      createdAt: new Date(now - faker.number.int({ min: 0, max: 30 * 24 * 60 * 60 * 1000 })) // Last 30 days
    });
  }

  return events;
}

async function generateEmbeddings(events: any[]) {
  console.log('Generating embeddings for prompts...');

  const embeddings = [];

  for (const event of events.slice(0, 100)) { // Limit to 100 for cost
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: event.promptText.slice(0, 8000)
    });

    embeddings.push({
      eventId: event.id,
      embedding: embedding.data[0].embedding
    });

    // Rate limit: 1 request per 100ms
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return embeddings;
}

async function seed() {
  console.log('Generating realistic events...');
  const events = await generateRealisticEvents(1000);

  console.log('Inserting events into database...');
  await db.insert(costEvents).values(events);

  console.log('Generating embeddings...');
  const embeddings = await generateEmbeddings(events);

  console.log('Inserting embeddings...');
  await db.insert(promptEmbeddings).values(embeddings);

  console.log('✅ Seed complete!');
  console.log(`- ${events.length} events`);
  console.log(`- ${embeddings.length} embeddings`);
  console.log(`- Providers: ${Object.keys(MODELS).join(', ')}`);
  console.log(`- Features: ${FEATURES.length}`);
}

seed().catch(console.error);
```

**Add to package.json:**
```json
{
  "scripts": {
    "seed": "tsx scripts/seed-data-v2.ts"
  }
}
```

**Install dependencies:**
```bash
pnpm add -D @faker-js/faker
```

## Todo List

- [ ] Create `apps/web/vitest.config.ts` with jsdom environment
- [ ] Create test setup with MSW server
- [ ] Add testing dependencies to `apps/web/package.json`
- [ ] Write ExportButton component tests (3 test cases)
- [ ] Write CachedTokensCard component tests (2 test cases)
- [ ] Write usePaginatedData hook tests (2 test cases)
- [ ] Write useExport hook tests (2 test cases)
- [ ] Write OpenAI streaming SDK tests (2 test cases)
- [ ] Write Gemini interceptor SDK tests (2 test cases)
- [ ] Write error tracking SDK tests (2 test cases)
- [ ] Write pagination utility tests (2 test cases)
- [ ] Write rate limiter middleware tests (2 test cases)
- [ ] Write similarity service tests (2 test cases)
- [ ] Create `seed-data-v2.ts` script with realistic patterns
- [ ] Add @faker-js/faker dependency
- [ ] Test seed script generates 1000 events in <10s
- [ ] Run coverage reports for all packages
- [ ] Verify >80% coverage for frontend, >90% for SDK

## Success Criteria

- [ ] All tests pass (`turbo test` succeeds)
- [ ] Coverage reports show: SDK 90%+, Backend 80%+, Frontend 80%+
- [ ] Seed script populates 1000 events + 100 embeddings
- [ ] MSW mocks work for all API endpoints
- [ ] No flaky tests (run 10 times, all pass)
- [ ] Test execution <30s for unit tests
- [ ] Seed data includes all 3 providers with realistic distributions

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenAI embeddings API cost for seed data | Low | Limit to 100 prompts, cache results |
| Flaky async tests | Medium | Use `waitFor` properly, increase timeouts |
| MSW version conflicts | Low | Pin MSW version, update handlers for v2 API |
| Coverage targets too aggressive | Low | Exclude generated files, focus on critical paths |

## Security Considerations

- Seed data should NOT include real user prompts (use faker)
- Test database should be isolated (not production)
- OpenAI API key for embeddings should be test-only key

## Next Steps

After Phase 4:
- Run full test suite on CI/CD
- Generate coverage badge for README
- Document testing guidelines in `docs/testing.md`
- Consider E2E tests with Playwright (future v1.1)
