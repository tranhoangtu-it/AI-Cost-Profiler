import {
  generateTraceId,
  generateSpanId,
} from '@ai-cost-profiler/shared';
import type { EventBatcher } from '../transport/event-batcher.js';
import { wrapGeminiStream } from './streaming-helpers.js';
import { buildSuccessEvent, buildErrorEvent, type EventContext } from './shared-event-builder.js';

/** Minimal interface for Gemini GenerativeModel (works with both @google/generative-ai and @google-cloud/vertexai) */
interface GeminiModel {
  model?: string;
  generateContent: (...args: unknown[]) => Promise<unknown>;
  generateContentStream?: (...args: unknown[]) => Promise<unknown>;
}

/**
 * Intercept Google Gemini client calls to capture usage and cost metrics
 * Supports both @google/generative-ai and @google-cloud/vertexai SDKs
 */
export function createGeminiInterceptor(
  client: GeminiModel,
  batcher: EventBatcher,
  feature: string,
  userId?: string
): GeminiModel {
  const isModel = typeof client.generateContent === 'function';

  if (!isModel) {
    return new Proxy(client, {
      get(target, prop) {
        if (prop === 'getGenerativeModel') {
          return (...args: unknown[]) => {
            const model = (target as any).getGenerativeModel(...args);
            return createGeminiInterceptor(model, batcher, feature, userId);
          };
        }
        return Reflect.get(target, prop);
      },
    });
  }

  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'generateContent') {
        return async (...args: unknown[]) => {
          const startTime = performance.now();
          const traceId = generateTraceId();
          const spanId = generateSpanId();
          const modelName = target.model ?? 'gemini-1.5-flash';
          const ctx: EventContext = { traceId, spanId, feature, userId, provider: 'google-gemini', model: modelName, isStreaming: false };

          try {
            const result = await target.generateContent(...args);
            const latencyMs = Math.round(performance.now() - startTime);

            const usage = (result as any).response?.usageMetadata;
            if (usage) {
              const inputTokens = usage.promptTokenCount ?? 0;
              const outputTokens = usage.candidatesTokenCount ?? 0;
              const cachedTokens = usage.cachedContentTokenCount ?? 0;
              batcher.add(buildSuccessEvent(ctx, { inputTokens, outputTokens, cachedTokens }, latencyMs));
            }

            return result;
          } catch (error) {
            const latencyMs = Math.round(performance.now() - startTime);
            batcher.add(buildErrorEvent(ctx, latencyMs, error));
            throw error;
          }
        };
      }

      if (prop === 'generateContentStream') {
        return async (...args: unknown[]) => {
          const startTime = performance.now();
          const traceId = generateTraceId();
          const spanId = generateSpanId();
          const modelName = target.model ?? 'gemini-1.5-flash';
          const ctx: EventContext = { traceId, spanId, feature, userId, provider: 'google-gemini', model: modelName, isStreaming: true };

          try {
            const streamResult = await target.generateContentStream!(...args);

            return wrapGeminiStream(
              streamResult as any,
              (usage) => {
                const latencyMs = Math.round(performance.now() - startTime);
                const inputTokens = usage.promptTokenCount ?? 0;
                const outputTokens = usage.candidatesTokenCount ?? 0;
                const cachedTokens = usage.cachedContentTokenCount ?? 0;
                batcher.add(buildSuccessEvent(ctx, { inputTokens, outputTokens, cachedTokens }, latencyMs));
              },
              (error) => {
                const latencyMs = Math.round(performance.now() - startTime);
                batcher.add(buildErrorEvent(ctx, latencyMs, error));
              }
            );
          } catch (error) {
            const latencyMs = Math.round(performance.now() - startTime);
            batcher.add(buildErrorEvent(ctx, latencyMs, error));
            throw error;
          }
        };
      }

      return Reflect.get(target, prop);
    },
  });
}
