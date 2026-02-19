# Phase 3a: SDK Package

## Context Links
- [System Architecture - SDK section](../../docs/system-architecture.md)
- [SDK Wrapper Research](./research/researcher-sdk-wrapper-visx-charts.md)
- [Plan Overview](./plan.md)

## Parallelization Info
- **Depends on:** Phase 2a (Shared Package - for types + cost calc)
- **Blocks:** Phase 5 (Integration)
- **Parallel with:** Phase 3b (Backend API)

## Overview
- **Priority:** P1
- **Status:** Complete
- **Est:** 6h

Build `packages/sdk` - the `profileAI()` wrapper that intercepts OpenAI/Anthropic client calls, captures tokens/cost/latency, batches events, and ships them to the server.

## Key Insights
- Proxy pattern wraps provider SDK client; intercepts `create()` methods
- Response `usage` object already contains token counts (no extra API call)
- Event batching: flush at 100 events OR 5s timer (whichever first)
- SDK must be zero-config beyond `serverUrl` and `feature`

## Requirements
### Functional
- `profileAI(client, config)` wraps OpenAI, Anthropic, or Google Gemini client
- Gemini support: auto-detect @google/generative-ai AND @google-cloud/vertexai SDK variants
<!-- Updated: Validation Session 1 - Added Gemini provider support (both SDK variants), effort 4h→6h -->
- Transparent: returns same response types as original client
- Captures: model, inputTokens, outputTokens, cachedTokens, latencyMs, estimatedCostUsd
- Tags events with feature, userId, traceId, spanId
- Batches events and POSTs to `{serverUrl}/api/v1/events`
- Supports streaming responses (capture tokens from stream end)

### Non-Functional
- <1ms overhead per call (excluding network flush)
- No modification of original client
- Graceful degradation: if flush fails, log warning, don't throw

## Architecture
```
packages/sdk/
├── src/
│   ├── index.ts                    # Public API: profileAI()
│   ├── profiler-wrapper.ts         # Core Proxy-based wrapper
│   ├── providers/
│   │   ├── openai-interceptor.ts   # OpenAI-specific interception
│   │   └── anthropic-interceptor.ts # Anthropic-specific interception
│   ├── transport/
│   │   └── event-batcher.ts        # Batching + HTTP flush
│   └── utils/
│       └── detect-provider.ts      # Auto-detect provider from client
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## File Ownership (Exclusive)
All files under `packages/sdk/src/`. Phase 1 owns stub `package.json`/`tsconfig.json`.

## Implementation Steps

### 1. Update packages/sdk/package.json
```json
{
  "name": "@ai-cost-profiler/sdk",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@ai-cost-profiler/shared": "workspace:*"
  },
  "peerDependencies": {
    "openai": "^4.0.0",
    "@anthropic-ai/sdk": "^0.20.0"
  },
  "peerDependenciesMeta": {
    "openai": { "optional": true },
    "@anthropic-ai/sdk": { "optional": true }
  },
  "devDependencies": {
    "openai": "^4.50.0",
    "@anthropic-ai/sdk": "^0.24.0",
    "tsup": "^8.0.0",
    "typescript": "^5.4.0"
  }
}
```

### 2. tsup.config.ts
```typescript
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['openai', '@anthropic-ai/sdk'],
});
```

### 3. src/utils/detect-provider.ts
```typescript
import type { Provider } from '@ai-cost-profiler/shared';

export function detectProvider(client: unknown): Provider {
  // OpenAI client has `chat.completions` path
  if (client && typeof client === 'object' && 'chat' in client) {
    return 'openai';
  }
  // Anthropic client has `messages` path
  if (client && typeof client === 'object' && 'messages' in client) {
    return 'anthropic';
  }
  throw new Error('Unsupported LLM client. Supported: OpenAI, Anthropic.');
}
```

### 4. src/transport/event-batcher.ts
```typescript
import type { LlmEvent } from '@ai-cost-profiler/shared';

export class EventBatcher {
  private buffer: LlmEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly serverUrl: string;

  constructor(serverUrl: string, batchSize = 100, flushIntervalMs = 5000) {
    this.serverUrl = serverUrl;
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;
    this.startTimer();
  }

  async add(event: LlmEvent): Promise<void> {
    this.buffer.push(event);
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    try {
      await fetch(`${this.serverUrl}/api/v1/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
      });
    } catch (err) {
      console.warn('[ai-cost-profiler] Failed to flush events:', err);
      // Re-add to buffer for retry (cap at 1000 to prevent memory leak)
      if (this.buffer.length < 1000) {
        this.buffer.unshift(...batch);
      }
    }
  }

  private startTimer(): void {
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
    // Unref so timer doesn't keep Node process alive
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.flush();
  }
}
```

### 5. src/providers/openai-interceptor.ts
```typescript
import {
  calculateCost, generateTraceId, generateSpanId,
  type LlmEvent, type SdkConfig,
} from '@ai-cost-profiler/shared';
import type { EventBatcher } from '../transport/event-batcher.js';

/**
 * Creates a Proxy handler for OpenAI client.
 * Intercepts chat.completions.create() and embeddings.create().
 */
export function createOpenAIProxy<T extends object>(
  client: T,
  config: SdkConfig,
  batcher: EventBatcher,
): T {
  const traceId = generateTraceId();

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // Intercept `chat` property to wrap `chat.completions.create`
      if (prop === 'chat' && value && typeof value === 'object') {
        return createChatProxy(value, config, batcher, traceId);
      }

      return value;
    },
  });
}

function createChatProxy(
  chat: Record<string, unknown>,
  config: SdkConfig,
  batcher: EventBatcher,
  traceId: string,
) {
  return new Proxy(chat, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'completions' && value && typeof value === 'object') {
        return createCompletionsProxy(value as Record<string, unknown>, config, batcher, traceId);
      }
      return value;
    },
  });
}

function createCompletionsProxy(
  completions: Record<string, unknown>,
  config: SdkConfig,
  batcher: EventBatcher,
  traceId: string,
) {
  return new Proxy(completions, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (prop === 'create' && typeof original === 'function') {
        return async function wrappedCreate(...args: unknown[]) {
          const startTime = Date.now();
          const params = args[0] as Record<string, unknown>;
          const model = (params?.model as string) ?? 'unknown';

          const response = await (original as Function).apply(target, args);
          const latencyMs = Date.now() - startTime;

          // Extract usage from response
          const usage = (response as Record<string, unknown>)?.usage as Record<string, number> | undefined;
          const inputTokens = usage?.prompt_tokens ?? 0;
          const outputTokens = usage?.completion_tokens ?? 0;

          const event: LlmEvent = {
            traceId,
            spanId: generateSpanId(),
            feature: config.feature,
            userId: config.userId,
            provider: 'openai',
            model,
            inputTokens,
            outputTokens,
            cachedTokens: 0,
            latencyMs,
            estimatedCostUsd: calculateCost(model, inputTokens, outputTokens),
            timestamp: new Date().toISOString(),
          };

          batcher.add(event);
          return response;
        };
      }
      return original;
    },
  });
}
```

### 6. src/providers/anthropic-interceptor.ts
```typescript
import {
  calculateCost, generateTraceId, generateSpanId,
  type LlmEvent, type SdkConfig,
} from '@ai-cost-profiler/shared';
import type { EventBatcher } from '../transport/event-batcher.js';

/**
 * Creates a Proxy handler for Anthropic client.
 * Intercepts messages.create().
 */
export function createAnthropicProxy<T extends object>(
  client: T,
  config: SdkConfig,
  batcher: EventBatcher,
): T {
  const traceId = generateTraceId();

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (prop === 'messages' && value && typeof value === 'object') {
        return createMessagesProxy(value as Record<string, unknown>, config, batcher, traceId);
      }

      return value;
    },
  });
}

function createMessagesProxy(
  messages: Record<string, unknown>,
  config: SdkConfig,
  batcher: EventBatcher,
  traceId: string,
) {
  return new Proxy(messages, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (prop === 'create' && typeof original === 'function') {
        return async function wrappedCreate(...args: unknown[]) {
          const startTime = Date.now();
          const params = args[0] as Record<string, unknown>;
          const model = (params?.model as string) ?? 'unknown';

          const response = await (original as Function).apply(target, args);
          const latencyMs = Date.now() - startTime;

          // Anthropic usage shape
          const usage = (response as Record<string, unknown>)?.usage as Record<string, number> | undefined;
          const inputTokens = usage?.input_tokens ?? 0;
          const outputTokens = usage?.output_tokens ?? 0;
          const cacheRead = (usage as Record<string, number>)?.cache_read_input_tokens ?? 0;

          const event: LlmEvent = {
            traceId,
            spanId: generateSpanId(),
            feature: config.feature,
            userId: config.userId,
            provider: 'anthropic',
            model,
            inputTokens,
            outputTokens,
            cachedTokens: cacheRead,
            latencyMs,
            estimatedCostUsd: calculateCost(model, inputTokens, outputTokens),
            timestamp: new Date().toISOString(),
          };

          batcher.add(event);
          return response;
        };
      }
      return original;
    },
  });
}
```

### 7. src/profiler-wrapper.ts
```typescript
import type { SdkConfig } from '@ai-cost-profiler/shared';
import { EventBatcher } from './transport/event-batcher.js';
import { detectProvider } from './utils/detect-provider.js';
import { createOpenAIProxy } from './providers/openai-interceptor.js';
import { createAnthropicProxy } from './providers/anthropic-interceptor.js';

export function profileAI<T extends object>(
  client: T,
  config: SdkConfig,
): T {
  if (config.enabled === false) return client;

  const batcher = new EventBatcher(
    config.serverUrl,
    config.batchSize ?? 100,
    config.flushIntervalMs ?? 5000,
  );

  const provider = detectProvider(client);

  switch (provider) {
    case 'openai':
      return createOpenAIProxy(client, config, batcher);
    case 'anthropic':
      return createAnthropicProxy(client, config, batcher);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
```

### 8. src/index.ts
```typescript
export { profileAI } from './profiler-wrapper.js';
export { EventBatcher } from './transport/event-batcher.js';
export type { SdkConfig } from '@ai-cost-profiler/shared';
```

### 9. Verify
- `pnpm build --filter @ai-cost-profiler/sdk`
- Check `dist/` has correct exports
- Types resolve when imported

## Todo List
- [x] Update `packages/sdk/package.json` with deps + peer deps
- [x] Create `tsup.config.ts`
- [x] Create `src/utils/detect-provider.ts`
- [x] Create `src/transport/event-batcher.ts`
- [x] Create `src/providers/openai-interceptor.ts`
- [x] Create `src/providers/anthropic-interceptor.ts`
- [x] Create `src/profiler-wrapper.ts`
- [x] Create `src/index.ts`
- [x] Build and verify

## Success Criteria
- `profileAI(openaiClient, config)` returns a proxy that intercepts `chat.completions.create()`
- `profileAI(anthropicClient, config)` returns a proxy that intercepts `messages.create()`
- Events batched and flushed via HTTP POST
- Flush failures logged but don't throw
- Package builds cleanly with correct DTS

## Conflict Prevention
Phase 3a owns all `packages/sdk/src/` files. No other phase touches this directory.

## Risk Assessment
- **Proxy compatibility:** Some SDK methods may not be intercepted (e.g., streaming). MVP handles non-streaming; streaming support can be added later.
- **Type safety:** Proxy returns `T` so consumer sees original types. TypeScript can't verify proxy intercepts at compile time.
- **Timer leak:** `unref()` on interval prevents blocking Node exit.

## Security
- No API keys stored in SDK; only event data shipped
- Server URL configurable; no hardcoded endpoints
- Failed flushes don't leak data (logged to console only)

## Next Steps
Phase 5 (Integration) wires SDK to the running server for end-to-end test.
