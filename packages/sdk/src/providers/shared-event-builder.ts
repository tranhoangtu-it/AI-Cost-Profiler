import type { LlmEvent } from '@ai-cost-profiler/shared';
import { calculateCost } from '@ai-cost-profiler/shared';
import { classifyApiError } from './error-classifier.js';

export interface EventContext {
  traceId: string;
  spanId: string;
  feature: string;
  userId?: string;
  provider: 'openai' | 'anthropic' | 'google-gemini';
  model: string;
  isStreaming: boolean;
}

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

/** Build success event with usage data */
export function buildSuccessEvent(
  ctx: EventContext,
  usage: UsageData,
  latencyMs: number
): LlmEvent {
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    feature: ctx.feature,
    userId: ctx.userId,
    provider: ctx.provider,
    model: ctx.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedTokens: usage.cachedTokens,
    latencyMs,
    estimatedCostUsd: calculateCost(ctx.model, usage.inputTokens, usage.outputTokens, usage.cachedTokens),
    timestamp: new Date().toISOString(),
    isStreaming: ctx.isStreaming,
    retryCount: 0,
    isError: false,
  };
}

/** Build error event */
export function buildErrorEvent(
  ctx: EventContext,
  latencyMs: number,
  error: unknown
): LlmEvent {
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    feature: ctx.feature,
    userId: ctx.userId,
    provider: ctx.provider,
    model: ctx.model,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    latencyMs,
    estimatedCostUsd: 0,
    timestamp: new Date().toISOString(),
    isStreaming: ctx.isStreaming,
    retryCount: 0,
    isError: true,
    errorCode: classifyApiError(error),
    metadata: { error: error instanceof Error ? error.message : String(error) },
  };
}
