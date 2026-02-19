/**
 * Seed script: generates realistic demo data for the dashboard.
 * Run: pnpm seed
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
  const HOURS_BACK = 72;

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
