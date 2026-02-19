/**
 * Seed script: generates realistic demo data for the dashboard.
 * Run: pnpm seed
 */
import 'dotenv/config';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../apps/server/src/db/schema.js';
import {
  generateTraceId, generateSpanId, calculateCost,
} from '../packages/shared/src/index.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const FEATURES = [
  'chat-summary',
  'search-query',
  'content-classify',
  'email-draft',
  'code-review',
  'text-generation',
  'data-extraction',
  'translation',
  'sentiment-analysis',
  'question-answering',
];
const MODELS_OPENAI = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];
const MODELS_ANTHROPIC = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'];
const MODELS_GEMINI = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];
const USERS = ['user-001', 'user-002', 'user-003', 'user-004', 'user-005'];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// Generate realistic hourly distribution (more during working hours)
function getHourWeight(hour: number): number {
  if (hour >= 9 && hour <= 17) return 3; // Working hours
  if (hour >= 6 && hour <= 21) return 1.5; // Extended hours
  return 0.5; // Night time
}

function weightedTimestamp(now: number, daysBack: number): Date {
  const msBack = randomInt(0, daysBack * 24 * 3600 * 1000);
  const timestamp = new Date(now - msBack);
  const hour = timestamp.getHours();

  // Re-roll with probability based on hour weight
  if (Math.random() > getHourWeight(hour) / 3) {
    return weightedTimestamp(now, daysBack);
  }

  return timestamp;
}

async function seed() {
  console.log('Seeding demo data...');

  const events = [];
  const now = Date.now();
  const DAYS_BACK = 30;
  const TOTAL_EVENTS = 1000;

  for (let i = 0; i < TOTAL_EVENTS; i++) {
    const feature = randomChoice(FEATURES);

    // Distribute across 3 providers
    const providerRand = Math.random();
    let provider: 'openai' | 'anthropic' | 'google-gemini';
    let model: string;

    if (providerRand < 0.4) {
      provider = 'openai';
      model = randomChoice(MODELS_OPENAI);
    } else if (providerRand < 0.7) {
      provider = 'anthropic';
      model = randomChoice(MODELS_ANTHROPIC);
    } else {
      provider = 'google-gemini';
      model = randomChoice(MODELS_GEMINI);
    }

    const isStreaming = Math.random() < 0.2; // 20% streaming
    const isError = Math.random() < 0.05; // 5% errors

    const inputTokens = isError ? 0 : randomInt(100, 8000);
    const outputTokens = isError ? 0 : randomInt(50, 2000);

    // 30% of successful requests have cached tokens (OpenAI/Anthropic only)
    const hasCachedTokens = !isError && Math.random() < 0.3 && provider !== 'google-gemini';
    const cachedTokens = hasCachedTokens ? randomInt(50, Math.floor(inputTokens * 0.5)) : 0;

    const latencyMs = isError ? randomInt(100, 1000) : randomInt(200, 5000);
    const cost = isError ? 0 : calculateCost(model, inputTokens, outputTokens, cachedTokens);
    const timestamp = weightedTimestamp(now, DAYS_BACK);

    // Error codes for failed requests
    const errorCodes = ['rate_limit', 'timeout', 'server_error', 'invalid_request'];
    const errorCode = isError ? randomChoice(errorCodes) : undefined;
    const retryCount = isError && Math.random() > 0.5 ? randomInt(1, 3) : 0;

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
      cachedTokens,
      latencyMs,
      estimatedCostUsd: String(cost),
      verifiedCostUsd: String(cost),
      isCacheHit: false,
      isStreaming,
      isError,
      errorCode,
      retryCount,
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

  // Sync Redis real-time counters with seeded data
  const totalCost = events.reduce((sum, e) => sum + parseFloat(e.estimatedCostUsd), 0);
  const totalTokens = events.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
  const redisClient = new Redis(redisUrl);
  await redisClient.set('realtime:total_cost', totalCost.toFixed(6));
  await redisClient.set('realtime:total_requests', String(events.length));
  await redisClient.set('realtime:total_tokens', String(totalTokens));
  console.log(`Redis synced: $${totalCost.toFixed(4)} | ${events.length} requests | ${totalTokens} tokens`);
  await redisClient.quit();

  console.log('Seeding complete!');
  await pool.end();
}

seed().catch(console.error);
