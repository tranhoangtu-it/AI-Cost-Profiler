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
  }) => void
): AsyncIterableIterator<any> {
  for await (const chunk of originalStream) {
    yield chunk;

    // Final chunk contains usage data
    if (chunk.usage) {
      onComplete(chunk.usage);
    }
  }
}

/**
 * Wrap Anthropic streaming response to capture token usage from events
 * Tokens arrive in message_start (input) and message_delta (output) events
 */
export async function* wrapAnthropicStream<T extends AsyncIterable<any>>(
  originalStream: T,
  onStart: (usage: {
    input_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  }) => void,
  onDelta: (usage: { output_tokens: number }) => void
): AsyncIterableIterator<any> {
  for await (const event of originalStream) {
    yield event;

    if (event.type === 'message_start') {
      onStart(event.message.usage);
    }

    if (event.type === 'message_delta') {
      onDelta(event.usage);
    }
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
  }) => void
): {
  stream: AsyncIterableIterator<any>;
  response: Promise<any>;
} {
  async function* wrappedStream() {
    for await (const chunk of streamResult.stream) {
      yield chunk;
    }

    // After stream completes, extract usage from final response
    const response = await streamResult.response;
    if (response.usageMetadata) {
      onComplete(response.usageMetadata);
    }
  }

  return {
    stream: wrappedStream(),
    response: streamResult.response,
  };
}
