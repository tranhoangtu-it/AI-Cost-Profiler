import { db, events } from '../db/index.js';
import { redis, REDIS_KEYS } from '../lib/redis.js';
import { lookupPricing, calculateCost } from '@ai-cost-profiler/shared';
import type { LlmEvent } from '@ai-cost-profiler/shared';
import { logger } from '../middleware/error-handler.js';

/**
 * Process and store a batch of LLM events
 * Enriches events with verified cost and updates Redis counters
 */
export async function processEventBatch(batch: LlmEvent[]): Promise<void> {
  try {
    // Enrich events with verified cost
    const enrichedEvents = batch.map((event) => {
      const pricing = lookupPricing(event.model);

      // Recalculate cost with verified pricing (per 1M tokens)
      const verifiedCost = calculateCost(
        event.model,
        event.inputTokens,
        event.outputTokens,
        event.cachedTokens
      );

      return {
        traceId: event.traceId,
        spanId: event.spanId,
        parentSpanId: event.parentSpanId,
        projectId: 'default',
        feature: event.feature,
        userId: event.userId,
        provider: event.provider,
        model: event.model,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cachedTokens: event.cachedTokens || 0,
        latencyMs: Math.round(event.latencyMs),
        estimatedCostUsd: event.estimatedCostUsd.toString(),
        verifiedCostUsd: verifiedCost.toString(),
        isCacheHit: (event.cachedTokens || 0) > 0,
        metadata: event.metadata,
        createdAt: new Date(event.timestamp),
      };
    });

    // Store in PostgreSQL
    await db.insert(events).values(enrichedEvents);

    // Update Redis counters using pipeline for atomicity
    const pipeline = redis.pipeline();

    let totalCost = 0;
    let totalTokens = 0;
    const requestCount = batch.length;

    for (const event of enrichedEvents) {
      const cost = parseFloat(event.verifiedCostUsd);
      totalCost += cost;
      totalTokens += event.inputTokens + event.outputTokens;
    }

    // Increment counters
    pipeline.incrbyfloat(REDIS_KEYS.TOTAL_COST, totalCost);
    pipeline.incrby(REDIS_KEYS.TOTAL_REQUESTS, requestCount);
    pipeline.incrby(REDIS_KEYS.TOTAL_TOKENS, totalTokens);

    await pipeline.exec();

    // Publish SSE update
    const sseMessage = JSON.stringify({
      type: 'cost_update',
      data: {
        costDelta: totalCost,
        requestsDelta: requestCount,
        tokensDelta: totalTokens,
        timestamp: new Date().toISOString(),
      },
    });

    await redis.publish(REDIS_KEYS.SSE_CHANNEL, sseMessage);

    logger.info({
      batchSize: batch.length,
      totalCost,
      totalTokens,
    }, 'Processed event batch');

  } catch (error) {
    logger.error({ error }, 'Failed to process event batch');
    throw error;
  }
}
