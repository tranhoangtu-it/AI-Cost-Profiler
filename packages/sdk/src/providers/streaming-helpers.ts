/**
 * Streaming wrapper utilities for LLM providers
 * Wraps async iterators to capture token usage from streaming responses
 */

/**
 * Wrap OpenAI streaming response to capture token usage from final chunk
 * OpenAI requires stream_options.include_usage = true to get usage in final chunk
 */
export async function* wrapOpenAIStream<T extends AsyncIterable<any>>(
  originalStream: T,
  onComplete: (usage: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
  }) => void,
  onError?: (error: unknown) => void
): AsyncIterableIterator<any> {
  try {
    for await (const chunk of originalStream) {
      yield chunk;

      // Final chunk contains usage data
      if (chunk.usage) {
        onComplete(chunk.usage);
      }
    }
  } catch (error) {
    onError?.(error);
    throw error;
  }
}

/**
 * Wrap Anthropic streaming response to capture token usage from events
 * Accumulates tokens and emits a single onComplete at stream end
 */
export async function* wrapAnthropicStream<T extends AsyncIterable<any>>(
  originalStream: T,
  onComplete: (usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
  }) => void,
  onError?: (error: unknown) => void
): AsyncIterableIterator<any> {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;

  try {
    for await (const event of originalStream) {
      yield event;

      if (event.type === 'message_start') {
        inputTokens = event.message.usage?.input_tokens ?? 0;
        cacheReadTokens = event.message.usage?.cache_read_input_tokens ?? 0;
      }

      // Accumulate output tokens from message_delta (Anthropic sends cumulative values)
      if (event.type === 'message_delta') {
        outputTokens = event.usage?.output_tokens ?? outputTokens;
      }
    }

    // Emit once after stream completes
    onComplete({ input_tokens: inputTokens, output_tokens: outputTokens, cache_read_input_tokens: cacheReadTokens });
  } catch (error) {
    onError?.(error);
    throw error;
  }
}

/**
 * Wrap Gemini streaming response to capture token usage from final aggregated response
 * Unlike OpenAI/Anthropic, Gemini only provides tokens in the final response object
 */
export function wrapGeminiStream(
  streamResult: {
    stream: AsyncIterable<any>;
    response: Promise<any>;
  },
  onComplete: (usage: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  }) => void,
  onError?: (error: unknown) => void
): {
  stream: AsyncIterableIterator<any>;
  response: Promise<any>;
} {
  async function* wrappedStream() {
    try {
      for await (const chunk of streamResult.stream) {
        yield chunk;
      }

      // After stream completes, extract usage from final response
      const response = await streamResult.response;
      if (response.usageMetadata) {
        onComplete(response.usageMetadata);
      }
    } catch (error) {
      onError?.(error);
      throw error;
    }
  }

  return {
    stream: wrappedStream(),
    response: streamResult.response,
  };
}
