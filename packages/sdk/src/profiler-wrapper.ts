import type { SdkConfig } from '@ai-cost-profiler/shared';
import { EventBatcher } from './transport/event-batcher.js';
import { detectProvider } from './utils/detect-provider.js';
import { createOpenAIInterceptor } from './providers/openai-interceptor.js';
import { createAnthropicInterceptor } from './providers/anthropic-interceptor.js';
import { createGeminiInterceptor } from './providers/gemini-interceptor.js';

/**
 * Wrap LLM client with profiling instrumentation
 * Intercepts API calls to capture tokens, cost, and latency metrics
 *
 * @param client OpenAI or Anthropic SDK client instance
 * @param config SDK configuration options
 * @returns Proxied client that sends metrics to server
 *
 * @example
 * ```typescript
 * import OpenAI from 'openai';
 * import { profileAI } from '@ai-cost-profiler/sdk';
 *
 * const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 * const profiledClient = profileAI(openai, {
 *   serverUrl: 'http://localhost:3001',
 *   feature: 'chat-completion',
 *   userId: 'user-123',
 * });
 *
 * // Use profiledClient normally - metrics sent automatically
 * const response = await profiledClient.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export function profileAI<T>(client: T, config: SdkConfig): T {
  // If profiling disabled, return client unchanged
  if (config.enabled === false) {
    return client;
  }

  // Create event batcher with config
  const batcher = new EventBatcher(
    config.serverUrl,
    config.batchSize ?? 10,
    config.flushIntervalMs ?? 5000
  );

  // Detect provider type from client structure
  const provider = detectProvider(client);

  // Apply appropriate interceptor based on provider
  switch (provider) {
    case 'openai':
      return createOpenAIInterceptor(
        client as any,
        batcher,
        config.feature,
        config.userId
      ) as T;

    case 'anthropic':
      return createAnthropicInterceptor(
        client as any,
        batcher,
        config.feature,
        config.userId
      ) as T;

    case 'google-gemini':
      return createGeminiInterceptor(
        client as any,
        batcher,
        config.feature,
        config.userId
      ) as T;

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
