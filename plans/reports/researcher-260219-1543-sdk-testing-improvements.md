# SDK Testing & Improvements Research

**Date:** 2026-02-19
**Scope:** Gemini support, streaming, testing strategy, error resilience

---

## 1. Gemini SDK Interceptor

### @google/generative-ai (Official SDK)

**Key methods to wrap:**
- `generateContent()` - single turn completion
- `generateContentStream()` - streaming responses
- `startChat().sendMessage()` - chat completions
- `startChat().sendMessageStream()` - streaming chat

**Token counting:**
- SDK provides `countTokens()` method - use for input token estimation
- Response object includes `usageMetadata: {promptTokenCount, candidatesTokenCount, totalTokenCount}`
- No native cached token tracking (not applicable for Gemini API)

**Proxy pattern:**
```ts
// Wrap GenerativeModel instance methods
const proxy = new Proxy(model, {
  get(target, prop) {
    if (prop === 'generateContent') {
      return async (...args) => {
        const start = Date.now();
        const result = await target.generateContent(...args);
        // Extract tokens from result.response.usageMetadata
        return result;
      };
    }
    return target[prop];
  }
});
```

**Pricing considerations:**
- Gemini 1.5 Flash/Pro have tiered pricing (input <128K vs >128K tokens)
- Gemini 2.0 Flash has different rates
- Track context length to apply correct tier

### Vertex AI SDK (@google-cloud/vertexai)

**Similar interception points:**
- `generateContent()`, `generateContentStream()`
- Uses same `usageMetadata` structure
- Requires GCP credentials (service account vs ADC)

**Implementation approach:**
- Create separate `profileVertexAI()` wrapper
- Share token extraction logic with @google/generative-ai variant
- Map model names to pricing (vertex uses different naming: `gemini-1.5-pro-001`)

---

## 2. Streaming Token Tracking

### OpenAI Streaming

**Pattern:**
```ts
const stream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  stream: true,
  stream_options: { include_usage: true } // CRITICAL
});

let outputTokens = 0;
for await (const chunk of stream) {
  // Accumulate delta content for token estimation
  if (chunk.choices[0]?.delta?.content) {
    // Count locally or wait for final chunk
  }
  // Final chunk includes usage
  if (chunk.usage) {
    outputTokens = chunk.usage.completion_tokens;
    inputTokens = chunk.usage.prompt_tokens;
  }
}
```

**Key points:**
- `stream_options.include_usage: true` required for token counts
- Usage data arrives in final chunk only
- Can estimate tokens incrementally via tiktoken library (optional)

### Anthropic Streaming

**Pattern:**
```ts
const stream = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [...],
  stream: true,
});

for await (const event of stream) {
  if (event.type === 'message_start') {
    inputTokens = event.message.usage.input_tokens;
  }
  if (event.type === 'message_delta') {
    outputTokens = event.usage.output_tokens; // cumulative
  }
}
```

**Key points:**
- Token counts in `message_start` and `message_delta` events
- `cache_creation_input_tokens` / `cache_read_input_tokens` for prompt caching
- Output tokens are cumulative in delta events

### Gemini Streaming

**Pattern:**
```ts
const result = await model.generateContentStream([...]);

let totalTokens = 0;
for await (const chunk of result.stream) {
  // Tokens not in individual chunks
}

// Final aggregated response includes usage
const response = await result.response;
const usage = response.usageMetadata; // {promptTokenCount, candidatesTokenCount}
```

**Key points:**
- No per-chunk token data
- Must await final aggregated response for `usageMetadata`
- Cannot get real-time token updates during streaming

### SDK Implementation

**Recommended approach:**
- Wrap stream async iterators with custom async generator
- Buffer events to extract final token counts
- Return proxy stream that yields original chunks + captures usage
- Emit cost event after stream completes

---

## 3. Testing Strategy

### Unit Tests (Vitest)

**Interceptor logic:**
- Mock LLM client methods (OpenAI, Anthropic, Gemini)
- Verify Proxy traps execute correctly
- Test token extraction from response objects
- Validate cost calculations (model pricing lookup)
- Test batch event accumulation in EventBatcher

**Coverage targets:**
- Interceptors: 100% (critical path)
- Token extraction: 100%
- Cost calculation: 100%
- EventBatcher: 95%+

**Example:**
```ts
describe('OpenAI interceptor', () => {
  it('captures tokens from non-streaming completion', async () => {
    const mockClient = { chat: { completions: { create: vi.fn() } } };
    mockClient.chat.completions.create.mockResolvedValue({
      usage: { prompt_tokens: 10, completion_tokens: 20 }
    });

    const profiled = profileAI(mockClient, { apiKey: 'test' });
    await profiled.chat.completions.create({...});

    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0].inputTokens).toBe(10);
  });
});
```

### Integration Tests

**Mock HTTP server:**
- Use MSW (Mock Service Worker) or nock to intercept SDK HTTP calls
- Return realistic LLM API responses
- Test full SDK → interceptor → event emission flow
- Verify batching and flush behavior

**Scenarios:**
- Successful completion (all providers)
- Streaming responses (all providers)
- Rate limit errors (429)
- Network timeouts
- Malformed API responses

### E2E Tests (Optional for MVP)

**Real API calls:**
- Use throwaway test API keys
- Small prompts to minimize cost (<$0.01 per test run)
- Validate token counts match actual provider billing
- Run only in CI/CD on main branch merges

**Guard rails:**
- Max token limits per test
- Skip E2E in dev environment
- Use `ENABLE_E2E_TESTS=true` env flag

### Recommended Coverage

- **Unit tests:** 90%+ line coverage for `packages/sdk`
- **Integration tests:** All provider combinations (OpenAI, Anthropic, Gemini × streaming/non-streaming)
- **E2E tests:** One smoke test per provider (manual verification)

---

## 4. Error Resilience

### Network Failures

**Strategy:**
- Wrap EventBatcher HTTP calls in try/catch
- Use exponential backoff for retries (3 attempts max)
- Queue failed events to in-memory buffer (max 1000 events)
- Log failures to console.warn, do not throw

**Implementation:**
```ts
async sendBatch(events) {
  try {
    await fetch(serverUrl, { method: 'POST', body: JSON.stringify(events) });
  } catch (err) {
    this.failedQueue.push(...events);
    console.warn('[profileAI] Failed to send events:', err.message);
    // Retry on next flush
  }
}
```

### Server Downtime

**Strategy:**
- Do not block LLM calls waiting for event delivery
- Fire-and-forget event sending (async, no await in interceptor)
- Local event buffer with TTL (5 min) or size limit (1000 events)
- Drop oldest events if buffer full

**Graceful degradation:**
- If server unavailable for >5 min, disable event sending
- Resume when server recovers (health check on next flush)

### Malformed Responses

**Strategy:**
- Validate LLM response structure before extracting tokens
- Use Zod schemas to parse usage metadata safely
- If tokens unavailable, estimate via tiktoken (OpenAI) or log warning
- Never throw errors in interceptor - always pass through original response

**Example:**
```ts
const usageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
}).optional();

const parsed = usageSchema.safeParse(response.usage);
if (!parsed.success) {
  console.warn('[profileAI] Missing usage data');
  return response; // Pass through unchanged
}
```

### Host Application Protection

**Principles:**
- SDK must be invisible to host app when profiling disabled
- No performance overhead >5ms per LLM call
- No memory leaks from unbounded event buffers
- No unhandled promise rejections

**Circuit breaker:**
- If event sending fails 10 consecutive times, disable profiling
- Re-enable after 60s cooldown
- Emit warning: "Cost profiling paused due to errors"

---

## Unresolved Questions

1. **Vertex AI authentication:** Should SDK auto-detect ADC (Application Default Credentials) or require explicit service account JSON path?
2. **Gemini streaming token lag:** Final `usageMetadata` only available after full stream consumption - acceptable UX trade-off?
3. **E2E test budget:** Allocate ≤$5/month for real API testing? Which providers to prioritize?
4. **EventBatcher flush interval:** Current recommendation is 5s - should this be configurable via SDK init options?
