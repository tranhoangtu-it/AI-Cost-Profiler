import type Anthropic from '@anthropic-ai/sdk';
import {
  generateTraceId,
  generateSpanId,
} from '@ai-cost-profiler/shared';
import type { EventBatcher } from '../transport/event-batcher.js';
import { wrapAnthropicStream } from './streaming-helpers.js';
import { buildSuccessEvent, buildErrorEvent, type EventContext } from './shared-event-builder.js';

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

                  // Handle streaming response
                  if (isStreaming) {
                    const model = params?.model ?? 'unknown';
                    const ctx: EventContext = { traceId, spanId, feature, userId, provider: 'anthropic', model, isStreaming: true };

                    return wrapAnthropicStream(
                      response as any,
                      (usage) => {
                        const latencyMs = Math.round(performance.now() - startTime);
                        const inputTokens = usage.input_tokens ?? 0;
                        const outputTokens = usage.output_tokens ?? 0;
                        const cachedTokens = usage.cache_read_input_tokens ?? 0;
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
                    const model = (response as any).model;
                    const ctx: EventContext = { traceId, spanId, feature, userId, provider: 'anthropic', model, isStreaming: false };
                    const inputTokens = usage.input_tokens ?? 0;
                    const outputTokens = usage.output_tokens ?? 0;
                    const cachedTokens = usage.cache_read_input_tokens ?? 0;
                    batcher.add(buildSuccessEvent(ctx, { inputTokens, outputTokens, cachedTokens }, latencyMs));
                  }

                  return response;
                } catch (error) {
                  const latencyMs = Math.round(performance.now() - startTime);
                  const params = args[0];
                  const model = params?.model ?? 'unknown';
                  const isStreaming = params?.stream === true;
                  const ctx: EventContext = { traceId, spanId, feature, userId, provider: 'anthropic', model, isStreaming };
                  batcher.add(buildErrorEvent(ctx, latencyMs, error));
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
