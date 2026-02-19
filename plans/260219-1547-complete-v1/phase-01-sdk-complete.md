---
phase: 1
title: "SDK Complete - Gemini, Streaming, Errors, Caching"
status: pending
effort: 14h
dependencies: []
---

# Phase 1: SDK Complete

## Overview

Complete SDK functionality with Gemini support, streaming for all providers, error/retry tracking, and cached token detection.

**Priority:** P1 (blocks Phase 4 integration tests)
**Effort:** 14h
**Parallelizable:** No (foundation for other phases)

## Context Links

- Research: `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/plans/reports/researcher-260219-1543-sdk-testing-improvements.md`
- MVP Phase 3a: `/Users/tranhoangtu/Desktop/PET/AI-Cost-Profiler/plans/260219-0107-ai-cost-profiler-mvp/phase-03a-sdk-package.md`

## Key Insights

- Gemini SDK provides `usageMetadata` in response (no manual counting needed)
- OpenAI streaming requires `stream_options: { include_usage: true }`
- Anthropic streaming has tokens in `message_start` + `message_delta` events
- Gemini streaming: tokens only in final aggregated response
- Cached tokens: OpenAI has `prompt_tokens_details.cached_tokens`, Anthropic has `cache_read_input_tokens`

## Requirements

### Functional
1. **Gemini Interceptor**: Support both `@google/generative-ai` and `@google-cloud/vertexai`
2. **Streaming Support**: All 3 providers (OpenAI, Anthropic, Gemini)
3. **Error Tracking**: Capture failed calls, retry count, error codes
4. **Cached Tokens**: Detect and track cached vs new prompt tokens
5. **Gemini Pricing**: Add model pricing constants to shared package

### Non-Functional
- SDK must not throw errors (pass through original response)
- Performance overhead <5ms per call
- Unit test coverage >90%

## Architecture

### Gemini Interceptor Pattern

```ts
// Auto-detect SDK variant
function isVertexAI(client: any): boolean {
  return !!client.project || !!client.location;
}

// Unified wrapper for both SDKs
const proxy = new Proxy(model, {
  get(target, prop) {
    if (prop === 'generateContent') {
      return wrapGenerateContent(target);
    }
    if (prop === 'generateContentStream') {
      return wrapGenerateContentStream(target);
    }
    return target[prop];
  }
});
```

### Streaming Token Extraction

**OpenAI:**
```ts
const stream = await client.chat.completions.create({
  stream: true,
  stream_options: { include_usage: true } // CRITICAL
});

for await (const chunk of stream) {
  if (chunk.usage) {
    // Final chunk has token counts
  }
}
```

**Anthropic:**
```ts
for await (const event of stream) {
  if (event.type === 'message_start') {
    inputTokens = event.message.usage.input_tokens;
    cachedTokens = event.message.usage.cache_read_input_tokens || 0;
  }
  if (event.type === 'message_delta') {
    outputTokens = event.usage.output_tokens;
  }
}
```

**Gemini:**
```ts
const result = await model.generateContentStream([...]);
for await (const chunk of result.stream) {
  // No per-chunk tokens
}
const response = await result.response;
const { promptTokenCount, candidatesTokenCount } = response.usageMetadata;
```

## Related Code Files

### To Modify
- `packages/sdk/src/providers/openai-interceptor.ts` - Add streaming support
- `packages/sdk/src/providers/anthropic-interceptor.ts` - Add streaming support
- `packages/sdk/src/utils/detect-provider.ts` - Add Gemini detection

### To Create
- `packages/sdk/src/providers/gemini-interceptor.ts` - New Gemini wrapper
- `packages/sdk/src/providers/streaming-helpers.ts` - Shared async iterator wrapper utils
- `packages/sdk/src/utils/error-tracker.ts` - Error event capture logic

### Shared Package Updates
- `packages/shared/src/constants/model-pricing.ts` - Add Gemini pricing
- `packages/shared/src/schemas/event-schema.ts` - Add `isStreaming`, `errorCode`, `retryCount`, `cachedInputTokens` fields

## Implementation Steps

### 1. Add Gemini Pricing Constants (1h)

**File:** `packages/shared/src/constants/model-pricing.ts`

```ts
export const GEMINI_PRICING = {
  'gemini-1.5-flash': { input: 0.075, output: 0.30, inputAbove128k: 0.15, outputAbove128k: 0.60 },
  'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15, inputAbove128k: 0.075, outputAbove128k: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00, inputAbove128k: 2.50, outputAbove128k: 10.00 },
  'gemini-2.0-flash-exp': { input: 0, output: 0 }, // Free during preview
} as const;
```

**Notes:**
- Pricing per 1M tokens (convert to per-token in cost calculator)
- Tiered pricing: <128k vs ≥128k tokens
- Add `calculateGeminiCost(model, inputTokens, outputTokens)` helper

### 2. Update Event Schema (1h)

**File:** `packages/shared/src/schemas/event-schema.ts`

Add new fields:
```ts
export const CostEventSchema = z.object({
  // ... existing fields
  isStreaming: z.boolean().default(false),
  cachedInputTokens: z.number().default(0),
  errorCode: z.string().optional(), // 'rate_limit', 'timeout', 'invalid_request', 'server_error'
  retryCount: z.number().default(0),
});
```

Update type exports.

### 3. Create Streaming Helpers (2h)

**File:** `packages/sdk/src/providers/streaming-helpers.ts`

```ts
export async function* wrapOpenAIStream(
  originalStream: AsyncIterable<any>,
  onComplete: (usage: { prompt_tokens: number; completion_tokens: number }) => void
) {
  for await (const chunk of originalStream) {
    yield chunk;
    if (chunk.usage) {
      onComplete(chunk.usage);
    }
  }
}

export async function* wrapAnthropicStream(
  originalStream: AsyncIterable<any>,
  onStart: (usage: any) => void,
  onDelta: (usage: any) => void
) {
  for await (const event of originalStream) {
    yield event;
    if (event.type === 'message_start') onStart(event.message.usage);
    if (event.type === 'message_delta') onDelta(event.usage);
  }
}

export async function* wrapGeminiStream(
  streamResult: { stream: AsyncIterable<any>; response: Promise<any> },
  onComplete: (usage: any) => void
) {
  for await (const chunk of streamResult.stream) {
    yield chunk;
  }
  const response = await streamResult.response;
  onComplete(response.usageMetadata);
}
```

### 4. Gemini Interceptor (4h)

**File:** `packages/sdk/src/providers/gemini-interceptor.ts`

```ts
import type { GenerativeModel } from '@google/generative-ai';
import { wrapGeminiStream } from './streaming-helpers';

export function createGeminiInterceptor(
  model: GenerativeModel,
  context: { apiKey: string; serverUrl: string; batcher: EventBatcher }
) {
  return new Proxy(model, {
    get(target, prop) {
      if (prop === 'generateContent') {
        return async (...args: any[]) => {
          const start = Date.now();
          const result = await target.generateContent(...args);

          const usage = result.response.usageMetadata;
          context.batcher.add({
            provider: 'google-gemini',
            model: target.model,
            inputTokens: usage.promptTokenCount,
            outputTokens: usage.candidatesTokenCount,
            latencyMs: Date.now() - start,
            isStreaming: false,
          });

          return result;
        };
      }

      if (prop === 'generateContentStream') {
        return async (...args: any[]) => {
          const start = Date.now();
          const streamResult = await target.generateContentStream(...args);

          const wrappedStream = wrapGeminiStream(streamResult, (usage) => {
            context.batcher.add({
              provider: 'google-gemini',
              model: target.model,
              inputTokens: usage.promptTokenCount,
              outputTokens: usage.candidatesTokenCount,
              latencyMs: Date.now() - start,
              isStreaming: true,
            });
          });

          return { stream: wrappedStream, response: streamResult.response };
        };
      }

      return target[prop];
    }
  });
}
```

**Notes:**
- Detect Vertex AI vs generative-ai by checking `client.project` property
- Share token extraction logic for both variants
- Handle both `generateContent` and `startChat().sendMessage()`

### 5. OpenAI Streaming (2h)

**File:** `packages/sdk/src/providers/openai-interceptor.ts` (modify existing)

Update `chat.completions.create` wrapper:
```ts
if (options.stream) {
  const originalStream = await originalMethod.apply(target, args);

  return wrapOpenAIStream(originalStream, (usage) => {
    batcher.add({
      // ... existing fields
      isStreaming: true,
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      cachedInputTokens: usage.prompt_tokens_details?.cached_tokens || 0,
    });
  });
}
```

**Critical:** Force `stream_options.include_usage = true` in options.

### 6. Anthropic Streaming (2h)

**File:** `packages/sdk/src/providers/anthropic-interceptor.ts` (modify existing)

```ts
if (options.stream) {
  const originalStream = await originalMethod.apply(target, args);

  let inputTokens = 0;
  let cachedTokens = 0;

  return wrapAnthropicStream(
    originalStream,
    (usage) => {
      inputTokens = usage.input_tokens;
      cachedTokens = usage.cache_read_input_tokens || 0;
    },
    (usage) => {
      batcher.add({
        // ... fields
        isStreaming: true,
        inputTokens,
        outputTokens: usage.output_tokens,
        cachedInputTokens: cachedTokens,
      });
    }
  );
}
```

### 7. Error Tracking (2h)

**File:** `packages/sdk/src/utils/error-tracker.ts`

```ts
export function wrapWithErrorTracking<T>(
  fn: (...args: any[]) => Promise<T>,
  onError: (error: any, retryCount: number) => void
): (...args: any[]) => Promise<T> {
  return async (...args: any[]) => {
    let retries = 0;

    while (true) {
      try {
        return await fn(...args);
      } catch (error) {
        const errorCode = classifyError(error);
        onError(error, retries);

        if (!shouldRetry(errorCode) || retries >= 3) {
          // Emit failed event
          throw error;
        }

        retries++;
        await sleep(Math.pow(2, retries) * 1000); // Exponential backoff
      }
    }
  };
}

function classifyError(error: any): string {
  if (error.status === 429) return 'rate_limit';
  if (error.code === 'ETIMEDOUT') return 'timeout';
  if (error.status >= 500) return 'server_error';
  return 'invalid_request';
}
```

Integrate into all interceptors to catch failed LLM calls.

## Todo List

- [ ] Add Gemini pricing to `packages/shared/src/constants/model-pricing.ts`
- [ ] Add tiered pricing calculator for Gemini (<128k vs ≥128k)
- [ ] Update `event-schema.ts` with new fields (isStreaming, cachedInputTokens, errorCode, retryCount)
- [ ] Create `streaming-helpers.ts` with wrapper utilities
- [ ] Create `gemini-interceptor.ts` (both SDK variants)
- [ ] Update `openai-interceptor.ts` with streaming support + cached token detection
- [ ] Update `anthropic-interceptor.ts` with streaming support + cached token detection
- [ ] Create `error-tracker.ts` with retry logic + error classification
- [ ] Update `detect-provider.ts` to recognize Gemini clients
- [ ] Add unit tests for all interceptors (streaming + non-streaming)
- [ ] Test error tracking with mocked failures
- [ ] Verify `stream_options.include_usage` injection in OpenAI

## Success Criteria

- [ ] OpenAI streaming returns valid AsyncIterable with usage in final chunk
- [ ] Anthropic streaming extracts cache tokens from `message_start`
- [ ] Gemini interceptor works with both SDK variants
- [ ] Error events captured with correct `errorCode` classification
- [ ] Cached tokens reduce calculated cost (verify in cost calculator)
- [ ] Unit tests cover streaming + error scenarios (>90% coverage)
- [ ] SDK passes through original responses unchanged (no breaking changes)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Gemini streaming tokens unavailable until end | Medium | Document in README, acceptable UX trade-off |
| OpenAI `stream_options` breaks existing code | High | Make injection conditional, fallback to estimation |
| Error tracking creates retry loops | Medium | Max 3 retries with exponential backoff |
| Cached token detection unreliable | Low | Default to 0 if fields missing |

## Security Considerations

- Never log full prompt text in error events (only truncated preview)
- Sanitize error messages (no API keys in stack traces)
- Rate limit EventBatcher retries to prevent DDoS on backend

## Next Steps

After Phase 1 completion:
- Phase 2 backend can consume new event fields (streaming, caching)
- Phase 3 dashboard can display cached token metrics
- Phase 4 integration tests can verify streaming behavior
