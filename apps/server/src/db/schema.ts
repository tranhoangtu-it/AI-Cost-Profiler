import { pgTable, uuid, text, integer, numeric, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Main events table for tracking LLM API calls
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    traceId: text('trace_id').notNull(),
    spanId: text('span_id').notNull(),
    parentSpanId: text('parent_span_id'),
    projectId: text('project_id').notNull().default('default'),
    feature: text('feature'),
    userId: text('user_id'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cachedTokens: integer('cached_tokens').default(0),
    latencyMs: integer('latency_ms').notNull(),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }),
    verifiedCostUsd: numeric('verified_cost_usd', { precision: 12, scale: 6 }),
    isCacheHit: boolean('is_cache_hit').default(false),
    metadata: jsonb('metadata'),
    // Streaming and error tracking fields
    isStreaming: boolean('is_streaming').default(false),
    errorCode: text('error_code'),
    retryCount: integer('retry_count').default(0),
    isError: boolean('is_error').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Cursor-based pagination composite index (critical for performance)
    createdAtIdIdx: index('events_created_at_id_idx').on(table.createdAt.desc(), table.id),
    // Filter indexes
    featureIdx: index('events_feature_idx').on(table.feature),
    modelIdx: index('events_model_idx').on(table.model),
    providerIdx: index('events_provider_idx').on(table.provider),
    // Composite indexes for common queries
    featureTimeIdx: index('events_feature_time_idx').on(table.feature, table.createdAt),
    userTimeIdx: index('events_user_time_idx').on(table.userId, table.createdAt),
    traceIdIdx: index('events_trace_id_idx').on(table.traceId),
  })
);

// Model pricing lookup table
export const modelPricing = pgTable(
  'model_pricing',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputPricePer1k: numeric('input_price_per_1k', { precision: 12, scale: 6 }).notNull(),
    outputPricePer1k: numeric('output_price_per_1k', { precision: 12, scale: 6 }).notNull(),
    effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerModelDateIdx: uniqueIndex('model_pricing_provider_model_date_idx').on(
      table.provider,
      table.model,
      table.effectiveDate
    ),
  })
);

// Prompt analysis results
export const promptAnalysis = pgTable(
  'prompt_analysis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    inputTokenRatio: numeric('input_token_ratio', { precision: 5, scale: 4 }),
    redundancyScore: numeric('redundancy_score', { precision: 5, scale: 4 }),
    suggestions: jsonb('suggestions').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventIdIdx: index('prompt_analysis_event_id_idx').on(table.eventId),
  })
);

// Prompt embeddings for similarity analysis (pgvector)
export const promptEmbeddings = pgTable(
  'prompt_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    embedding: text('embedding').notNull(), // Store as text, cast to vector in queries
    promptHash: text('prompt_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventIdIdx: index('prompt_embeddings_event_id_idx').on(table.eventId),
  })
);

// Pre-aggregated cost data for faster queries
export const costAggregates = pgTable(
  'cost_aggregates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: text('project_id').notNull(),
    feature: text('feature'),
    model: text('model'),
    period: text('period').notNull(), // 'hour', 'day', 'week', 'month'
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    totalCost: numeric('total_cost', { precision: 12, scale: 6 }).notNull(),
    totalTokens: integer('total_tokens').notNull(),
    callCount: integer('call_count').notNull(),
    avgLatency: integer('avg_latency'),
  },
  (table) => ({
    projectFeatureModelPeriodIdx: uniqueIndex('cost_aggregates_unique_idx').on(
      table.projectId,
      table.feature,
      table.model,
      table.period,
      table.periodStart
    ),
    periodIdx: index('cost_aggregates_period_idx').on(table.period, table.periodStart),
  })
);

// Type exports for usage in application code
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type ModelPricing = typeof modelPricing.$inferSelect;
export type NewModelPricing = typeof modelPricing.$inferInsert;
export type PromptAnalysis = typeof promptAnalysis.$inferSelect;
export type NewPromptAnalysis = typeof promptAnalysis.$inferInsert;
export type PromptEmbedding = typeof promptEmbeddings.$inferSelect;
export type NewPromptEmbedding = typeof promptEmbeddings.$inferInsert;
export type CostAggregate = typeof costAggregates.$inferSelect;
export type NewCostAggregate = typeof costAggregates.$inferInsert;
