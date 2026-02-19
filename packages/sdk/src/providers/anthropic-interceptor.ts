import type Anthropic from '@anthropic-ai/sdk';
import type { LlmEvent } from '@ai-cost-profiler/shared';
import {
  calculateCost,
  generateTraceId,
  generateSpanId,
} from '@ai-cost-profiler/shared';
import type { EventBatcher } from '../transport/event-batcher.js';
import { wrapAnthropicStream } from './streaming-helpers.js';
import { classifyApiError } from './error-classifier.js';

/**
 * Intercept Anthropic client calls to capture usage and cost metrics
 */
export function createAnthropicInterceptor(
  client: Anthropic,
  batcher: EventBatcher,
  feature: string,
  userId?: string
): Anthropic {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'messages') {
        return new Proxy(target.messages, {
          get(messagesTarget, messagesProp) {
            if (messagesProp === 'create') {
              return async (...args: Parameters<typeof messagesTarget.create>) => {
                const startTime = performance.now();
                const traceId = generateTraceId();
                const spanId = generateSpanId();

                try {
                  const params = args[0];
                  const isStreaming = params?.stream === true;

                  const response = await messagesTarget.create(...args);

                  // Handle streaming response - emits exactly 1 event at stream end
                  if (isStreaming) {
                    const model = params?.model ?? 'unknown';

                    return wrapAnthropicStream(
                      response as any,
                      (usage) => {
                        const endTime = performance.now();
                        const latencyMs = Math.round(endTime - startTime);
                        const inputTokens = usage.input_tokens ?? 0;
                        const outputTokens = usage.output_tokens ?? 0;
                        const cachedTokens = usage.cache_read_input_tokens ?? 0;

                        const event: LlmEvent = {
                          traceId,
                          spanId,
                          feature,
                          userId,
                          provider: 'anthropic',
                          model,
                          inputTokens,
                          outputTokens,
                          cachedTokens,
                          latencyMs,
                          estimatedCostUsd: calculateCost(model, inputTokens, outputTokens, cachedTokens),
                          timestamp: new Date().toISOString(),
                          isStreaming: true,
                          retryCount: 0,
                          isError: false,
                        };

                        batcher.add(event);
                      },
                      (error) => {
                        const endTime = performance.now();
                        const latencyMs = Math.round(endTime - startTime);

                        const event: LlmEvent = {
                          traceId,
                          spanId,
                          feature,
                          userId,
                          provider: 'anthropic',
                          model,
                          inputTokens: 0,
                          outputTokens: 0,
                          cachedTokens: 0,
                          latencyMs,
                          estimatedCostUsd: 0,
                          timestamp: new Date().toISOString(),
                          isStreaming: true,
                          retryCount: 0,
                          isError: true,
                          errorCode: classifyApiError(error),
                          metadata: { error: error instanceof Error ? error.message : String(error) },
                        };

                        batcher.add(event);
                      }
                    );
                  }

                  // Handle non-streaming response
                  const endTime = performance.now();
                  const latencyMs = Math.round(endTime - startTime);

                  const usage = (response as any).usage;
                  if (usage) {
                    const inputTokens = usage.input_tokens ?? 0;
                    const outputTokens = usage.output_tokens ?? 0;
                    const cachedTokens = usage.cache_read_input_tokens ?? 0;
                    const model = (response as any).model;

                    const event: LlmEvent = {
                      traceId,
                      spanId,
                      feature,
                      userId,
                      provider: 'anthropic',
                      model,
                      inputTokens,
                      outputTokens,
                      cachedTokens,
                      latencyMs,
                      estimatedCostUsd: calculateCost(model, inputTokens, outputTokens, cachedTokens),
                      timestamp: new Date().toISOString(),
                      isStreaming: false,
                      retryCount: 0,
                      isError: false,
                    };

                    batcher.add(event);
                  }

                  return response;
                } catch (error) {
                  const endTime = performance.now();
                  const latencyMs = Math.round(endTime - startTime);

                  const params = args[0];
                  const model = params?.model ?? 'unknown';
                  const isStreaming = params?.stream === true;

                  const event: LlmEvent = {
                    traceId,
                    spanId,
                    feature,
                    userId,
                    provider: 'anthropic',
                    model,
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    latencyMs,
                    estimatedCostUsd: 0,
                    timestamp: new Date().toISOString(),
                    isStreaming,
                    retryCount: 0,
                    isError: true,
                    errorCode: classifyApiError(error),
                    metadata: { error: error instanceof Error ? error.message : String(error) },
                  };

                  batcher.add(event);
                  throw error;
                }
              };
            }
            return Reflect.get(messagesTarget, messagesProp);
          },
        });
      }
      return Reflect.get(target, prop);
    },
  });
}
