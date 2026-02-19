/**
 * Smoke test: SDK -> Server flow.
 * Run: pnpm test:smoke
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
