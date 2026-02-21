import type OpenAI from 'openai';
import {
  generateTraceId,
  generateSpanId,
} from '@ai-cost-profiler/shared';
import type { EventBatcher } from '../transport/event-batcher.js';
import { wrapOpenAIStream } from './streaming-helpers.js';
import { buildSuccessEvent, buildErrorEvent, type EventContext } from './shared-event-builder.js';

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

                        if (isStreaming && params) {
                          params.stream_options = { include_usage: true };
                        }

                        const response = await completionsTarget.create(...args);
                        const model = params?.model ?? 'unknown';
                        const ctx: EventContext = { traceId, spanId, feature, userId, provider: 'openai', model, isStreaming };

                        // Handle streaming response
                        if (isStreaming) {
                          return wrapOpenAIStream(
                            response as any,
                            (usage) => {
                              const latencyMs = Math.round(performance.now() - startTime);
                              const inputTokens = usage.prompt_tokens ?? 0;
                              const outputTokens = usage.completion_tokens ?? 0;
                              const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
                              batcher.add(buildSuccessEvent(ctx, { inputTokens, outputTokens, cachedTokens }, latencyMs));
                            },
                            (error) => {
                              const latencyMs = Math.round(performance.now() - startTime);
                              batcher.add(buildErrorEvent(ctx, latencyMs, error));
                            }
                          );
                        }

                        // Handle non-streaming response
                        const latencyMs = Math.round(performance.now() - startTime);
                        const usage = (response as any).usage;
                        if (usage) {
                          const nonStreamCtx: EventContext = { traceId, spanId, feature, userId, provider: 'openai', model: (response as any).model, isStreaming: false };
                          const inputTokens = usage.prompt_tokens ?? 0;
                          const outputTokens = usage.completion_tokens ?? 0;
                          const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
                          batcher.add(buildSuccessEvent(nonStreamCtx, { inputTokens, outputTokens, cachedTokens }, latencyMs));
                        }

                        return response;
                      } catch (error) {
                        const latencyMs = Math.round(performance.now() - startTime);
                        const params = args[0];
                        const model = params?.model ?? 'unknown';
                        const isStreaming = params?.stream === true;
                        const ctx: EventContext = { traceId, spanId, feature, userId, provider: 'openai', model, isStreaming };
                        batcher.add(buildErrorEvent(ctx, latencyMs, error));
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
