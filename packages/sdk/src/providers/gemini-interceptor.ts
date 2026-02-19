import type { LlmEvent } from '@ai-cost-profiler/shared';
import {
  calculateCost,
  generateTraceId,
  generateSpanId,
} from '@ai-cost-profiler/shared';
import type { EventBatcher } from '../transport/event-batcher.js';
import { wrapGeminiStream } from './streaming-helpers.js';

/**
 * Intercept Google Gemini client calls to capture usage and cost metrics
 * Supports both @google/generative-ai and @google-cloud/vertexai SDKs
 */
export function createGeminiInterceptor(
  client: any,
  batcher: EventBatcher,
  feature: string,
  userId?: string
): any {
  // Detect if this is a GenerativeModel instance or VertexAI client
  const isModel = typeof client.generateContent === 'function';

  if (!isModel) {
    // If it's a client wrapper, we need to intercept getGenerativeModel()
    return new Proxy(client, {
      get(target, prop) {
        if (prop === 'getGenerativeModel') {
          return (...args: any[]) => {
            const model = target.getGenerativeModel(...args);
            return createGeminiInterceptor(model, batcher, feature, userId);
          };
        }
        return Reflect.get(target, prop);
      },
    });
  }

  // Intercept GenerativeModel instance methods
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'generateContent') {
        return async (...args: any[]) => {
          const startTime = performance.now();
          const traceId = generateTraceId();
          const spanId = generateSpanId();

          try {
            const result = await target.generateContent(...args);
            const endTime = performance.now();
            const latencyMs = Math.round(endTime - startTime);

            // Extract usage from response
            const usage = result.response?.usageMetadata;
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
                estimatedCostUsd: calculateCost(
                  modelName,
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

            return result;
          } catch (error) {
            // Track failed calls
            const endTime = performance.now();
            const latencyMs = Math.round(endTime - startTime);
            const modelName = target.model ?? 'gemini-1.5-flash';

            const errorCode = classifyGeminiError(error);

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

      if (prop === 'generateContentStream') {
        return async (...args: any[]) => {
          const startTime = performance.now();
          const traceId = generateTraceId();
          const spanId = generateSpanId();

          try {
            const streamResult = await target.generateContentStream(...args);
            const modelName = target.model ?? 'gemini-1.5-flash';

            const wrappedStream = wrapGeminiStream(streamResult, (usage) => {
              const endTime = performance.now();
              const latencyMs = Math.round(endTime - startTime);

              const inputTokens = usage.promptTokenCount ?? 0;
              const outputTokens = usage.candidatesTokenCount ?? 0;
              const cachedTokens = usage.cachedContentTokenCount ?? 0;

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
                estimatedCostUsd: calculateCost(
                  modelName,
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

            return wrappedStream;
          } catch (error) {
            // Track failed streaming calls
            const endTime = performance.now();
            const latencyMs = Math.round(endTime - startTime);
            const modelName = target.model ?? 'gemini-1.5-flash';

            const errorCode = classifyGeminiError(error);

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

      return Reflect.get(target, prop);
    },
  });
}

/**
 * Classify Gemini API errors into standard error codes
 */
function classifyGeminiError(error: any): string {
  if (error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
    return 'rate_limit';
  }
  if (error.status === 503 || error.message?.includes('UNAVAILABLE')) {
    return 'server_error';
  }
  if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
    return 'timeout';
  }
  if (error.status === 400 || error.message?.includes('INVALID_ARGUMENT')) {
    return 'invalid_request';
  }
  return 'unknown_error';
}
