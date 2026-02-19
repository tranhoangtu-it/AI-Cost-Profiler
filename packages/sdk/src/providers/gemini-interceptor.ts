import type { LlmEvent } from '@ai-cost-profiler/shared';
import {
  calculateCost,
  generateTraceId,
  generateSpanId,
} from '@ai-cost-profiler/shared';
import type { EventBatcher } from '../transport/event-batcher.js';
import { wrapGeminiStream } from './streaming-helpers.js';
import { classifyApiError } from './error-classifier.js';

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
    // If it's a client wrapper, intercept getGenerativeModel()
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

          try {
            const result = await target.generateContent(...args);
            const endTime = performance.now();
            const latencyMs = Math.round(endTime - startTime);

            const usage = (result as any).response?.usageMetadata;
            if (usage) {
              const inputTokens = usage.promptTokenCount ?? 0;
              const outputTokens = usage.candidatesTokenCount ?? 0;
              const cachedTokens = usage.cachedContentTokenCount ?? 0;
              const modelName = target.model ?? 'gemini-1.5-flash';

              const event: LlmEvent = {
                traceId,
                spanId,
                feature,
                userId,
                provider: 'google-gemini',
                model: modelName,
                inputTokens,
                outputTokens,
                cachedTokens,
                latencyMs,
                estimatedCostUsd: calculateCost(modelName, inputTokens, outputTokens, cachedTokens),
                timestamp: new Date().toISOString(),
                isStreaming: false,
                retryCount: 0,
                isError: false,
              };

              batcher.add(event);
            }

            return result;
          } catch (error) {
            const endTime = performance.now();
            const latencyMs = Math.round(endTime - startTime);
            const modelName = target.model ?? 'gemini-1.5-flash';

            const event: LlmEvent = {
              traceId,
              spanId,
              feature,
              userId,
              provider: 'google-gemini',
              model: modelName,
              inputTokens: 0,
              outputTokens: 0,
              cachedTokens: 0,
              latencyMs,
              estimatedCostUsd: 0,
              timestamp: new Date().toISOString(),
              isStreaming: false,
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

      if (prop === 'generateContentStream') {
        return async (...args: unknown[]) => {
          const startTime = performance.now();
          const traceId = generateTraceId();
          const spanId = generateSpanId();

          try {
            const streamResult = await target.generateContentStream!(...args);
            const modelName = target.model ?? 'gemini-1.5-flash';

            return wrapGeminiStream(
              streamResult as any,
              (usage) => {
                const endTime = performance.now();
                const latencyMs = Math.round(endTime - startTime);

                const inputTokens = usage.promptTokenCount ?? 0;
                const outputTokens = usage.candidatesTokenCount ?? 0;

                const event: LlmEvent = {
                  traceId,
                  spanId,
                  feature,
                  userId,
                  provider: 'google-gemini',
                  model: modelName,
                  inputTokens,
                  outputTokens,
                  cachedTokens: 0,
                  latencyMs,
                  estimatedCostUsd: calculateCost(modelName, inputTokens, outputTokens, 0),
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
                  provider: 'google-gemini',
                  model: modelName,
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
          } catch (error) {
            const endTime = performance.now();
            const latencyMs = Math.round(endTime - startTime);
            const modelName = target.model ?? 'gemini-1.5-flash';

            const event: LlmEvent = {
              traceId,
              spanId,
              feature,
              userId,
              provider: 'google-gemini',
              model: modelName,
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
            throw error;
          }
        };
      }

      return Reflect.get(target, prop);
    },
  });
}
