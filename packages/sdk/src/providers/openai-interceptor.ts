import type OpenAI from 'openai';
import type { LlmEvent } from '@ai-cost-profiler/shared';
import {
  calculateCost,
  generateTraceId,
  generateSpanId,
} from '@ai-cost-profiler/shared';
import type { EventBatcher } from '../transport/event-batcher.js';
import { wrapOpenAIStream } from './streaming-helpers.js';

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
                        const params = args[0];
                        const isStreaming = params?.stream === true;

                        // For streaming, inject stream_options to get usage data
                        if (isStreaming && params) {
                          params.stream_options = { include_usage: true };
                        }

                        const response = await completionsTarget.create(...args);

                        // Handle streaming response
                        if (isStreaming) {
                          const model = params?.model ?? 'unknown';

                          return wrapOpenAIStream(response as any, (usage) => {
                            const endTime = performance.now();
                            const latencyMs = Math.round(endTime - startTime);

                            const inputTokens = usage.prompt_tokens ?? 0;
                            const outputTokens = usage.completion_tokens ?? 0;
                            const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;

                            const event: LlmEvent = {
                              traceId,
                              spanId,
                              feature,
                              userId,
                              provider: 'openai',
                              model,
                              inputTokens,
                              outputTokens,
                              cachedTokens,
                              latencyMs,
                              estimatedCostUsd: calculateCost(
                                model,
                                inputTokens,
                                outputTokens,
                                cachedTokens
                              ),
                              timestamp: new Date().toISOString(),
                              isStreaming: true,
                              retryCount: 0,
                              isError: false,
                            };

                            batcher.add(event);
                          });
                        }

                        // Handle non-streaming response
                        const endTime = performance.now();
                        const latencyMs = Math.round(endTime - startTime);

                        // Extract usage from response
                        const usage = (response as any).usage;
                        if (usage) {
                          const inputTokens = usage.prompt_tokens ?? 0;
                          const outputTokens = usage.completion_tokens ?? 0;
                          const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
                          const model = (response as any).model;

                          const event: LlmEvent = {
                            traceId,
                            spanId,
                            feature,
                            userId,
                            provider: 'openai',
                            model,
                            inputTokens,
                            outputTokens,
                            cachedTokens,
                            latencyMs,
                            estimatedCostUsd: calculateCost(
                              model,
                              inputTokens,
                              outputTokens,
                              cachedTokens
                            ),
                            timestamp: new Date().toISOString(),
                            isStreaming: false,
                            retryCount: 0,
                            isError: false,
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
                        const isStreaming = params?.stream === true;

                        const errorCode = classifyOpenAIError(error);

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
                          isStreaming,
                          retryCount: 0,
                          isError: true,
                          errorCode,
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

/**
 * Classify OpenAI API errors into standard error codes
 */
function classifyOpenAIError(error: any): string {
  if (error.status === 429) {
    return 'rate_limit';
  }
  if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
    return 'timeout';
  }
  if (error.status && error.status >= 500) {
    return 'server_error';
  }
  if (error.status === 400 || error.status === 401 || error.status === 403) {
    return 'invalid_request';
  }
  return 'unknown_error';
}
