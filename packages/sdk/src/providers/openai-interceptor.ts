import type OpenAI from 'openai';
import type { LlmEvent } from '@ai-cost-profiler/shared';
import {
  calculateCost,
  generateTraceId,
  generateSpanId,
} from '@ai-cost-profiler/shared';
import type { EventBatcher } from '../transport/event-batcher.js';

/**
 * Intercept OpenAI client calls to capture usage and cost metrics
 */
export function createOpenAIInterceptor(
  client: OpenAI,
  batcher: EventBatcher,
  feature: string,
  userId?: string
): OpenAI {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'chat') {
        return new Proxy(target.chat, {
          get(chatTarget, chatProp) {
            if (chatProp === 'completions') {
              return new Proxy(chatTarget.completions, {
                get(completionsTarget, completionsProp) {
                  if (completionsProp === 'create') {
                    return async (...args: Parameters<typeof completionsTarget.create>) => {
                      const startTime = performance.now();
                      const traceId = generateTraceId();
                      const spanId = generateSpanId();

                      try {
                        const response = await completionsTarget.create(...args);
                        const endTime = performance.now();
                        const latencyMs = Math.round(endTime - startTime);

                        // Extract usage from response
                        const usage = response.usage;
                        if (usage) {
                          const inputTokens = usage.prompt_tokens ?? 0;
                          const outputTokens = usage.completion_tokens ?? 0;
                          const model = response.model;

                          const event: LlmEvent = {
                            traceId,
                            spanId,
                            feature,
                            userId,
                            provider: 'openai',
                            model,
                            inputTokens,
                            outputTokens,
                            cachedTokens: 0,
                            latencyMs,
                            estimatedCostUsd: calculateCost(
                              model,
                              inputTokens,
                              outputTokens
                            ),
                            timestamp: new Date().toISOString(),
                          };

                          batcher.add(event);
                        }

                        return response;
                      } catch (error) {
                        // Still track failed calls with latency
                        const endTime = performance.now();
                        const latencyMs = Math.round(endTime - startTime);

                        const params = args[0];
                        const model = params?.model ?? 'unknown';

                        const event: LlmEvent = {
                          traceId,
                          spanId,
                          feature,
                          userId,
                          provider: 'openai',
                          model,
                          inputTokens: 0,
                          outputTokens: 0,
                          cachedTokens: 0,
                          latencyMs,
                          estimatedCostUsd: 0,
                          timestamp: new Date().toISOString(),
                          metadata: {
                            error: error instanceof Error ? error.message : String(error),
                          },
                        };

                        batcher.add(event);
                        throw error;
                      }
                    };
                  }
                  return Reflect.get(completionsTarget, completionsProp);
                },
              });
            }
            return Reflect.get(chatTarget, chatProp);
          },
        });
      }
      return Reflect.get(target, prop);
    },
  });
}
