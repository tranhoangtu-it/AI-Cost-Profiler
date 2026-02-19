import { z } from 'zod';

/**
 * Provider enum for LLM services
 */
export const providerSchema = z.enum(['openai', 'anthropic', 'google-gemini']);

/**
 * Core LLM event schema capturing token usage, cost, and latency
 */
export const llmEventSchema = z.object({
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  parentSpanId: z.string().optional(),
  feature: z.string().min(1),
  userId: z.string().optional(),
  provider: providerSchema,
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative().default(0),
  latencyMs: z.number().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
  // Streaming support
  isStreaming: z.boolean().default(false),
  // Error tracking
  errorCode: z.string().optional(),
  retryCount: z.number().int().nonnegative().default(0),
  isError: z.boolean().default(false),
});

/**
 * Batch event request schema with validation limits
 */
export const batchEventRequestSchema = z.object({
  events: z.array(llmEventSchema).min(1).max(500),
});

export type LlmEvent = z.infer<typeof llmEventSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type BatchEventRequest = z.infer<typeof batchEventRequestSchema>;
