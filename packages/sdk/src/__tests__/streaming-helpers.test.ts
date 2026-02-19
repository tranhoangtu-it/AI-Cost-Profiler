import { describe, it, expect, vi } from 'vitest';
import {
  wrapOpenAIStream,
  wrapAnthropicStream,
  wrapGeminiStream,
} from '../providers/streaming-helpers.js';

describe('Streaming Helpers', () => {
  describe('wrapOpenAIStream', () => {
    it('should yield all chunks', async () => {
      const mockChunks = [
        { id: '1', choices: [{ delta: { content: 'Hello' } }] },
        { id: '2', choices: [{ delta: { content: ' world' } }] },
        { id: '3', choices: [{ delta: { content: '!' } }] },
      ];

      async function* mockStream() {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      }

      const onComplete = vi.fn();
      const wrapped = wrapOpenAIStream(mockStream(), onComplete);

      const yielded = [];
      for await (const chunk of wrapped) {
        yielded.push(chunk);
      }

      expect(yielded).toEqual(mockChunks);
    });

    it('should call onComplete with usage from final chunk', async () => {
      const mockChunks = [
        { id: '1', choices: [{ delta: { content: 'test' } }] },
        {
          id: '2',
          choices: [{ delta: {} }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            prompt_tokens_details: { cached_tokens: 20 },
          },
        },
      ];

      async function* mockStream() {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      }

      const onComplete = vi.fn();
      const wrapped = wrapOpenAIStream(mockStream(), onComplete);

      for await (const chunk of wrapped) {
        // Consume stream
      }

      expect(onComplete).toHaveBeenCalledWith({
        prompt_tokens: 100,
        completion_tokens: 50,
        prompt_tokens_details: { cached_tokens: 20 },
      });
    });

    it('should not call onComplete if no usage in chunks', async () => {
      const mockChunks = [
        { id: '1', choices: [{ delta: { content: 'test' } }] },
        { id: '2', choices: [{ delta: { content: '!' } }] },
      ];

      async function* mockStream() {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      }

      const onComplete = vi.fn();
      const wrapped = wrapOpenAIStream(mockStream(), onComplete);

      for await (const chunk of wrapped) {
        // Consume stream
      }

      expect(onComplete).not.toHaveBeenCalled();
    });

    it('should handle empty stream', async () => {
      async function* mockStream() {
        // Empty
      }

      const onComplete = vi.fn();
      const wrapped = wrapOpenAIStream(mockStream(), onComplete);

      const yielded = [];
      for await (const chunk of wrapped) {
        yielded.push(chunk);
      }

      expect(yielded).toEqual([]);
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('wrapAnthropicStream', () => {
    it('should yield all events', async () => {
      const mockEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 100 } } },
        { type: 'content_block_delta', delta: { text: 'Hello' } },
        { type: 'message_delta', usage: { output_tokens: 50 } },
      ];

      async function* mockStream() {
        for (const event of mockEvents) {
          yield event;
        }
      }

      const onComplete = vi.fn();
      const wrapped = wrapAnthropicStream(mockStream(), onComplete);

      const yielded = [];
      for await (const event of wrapped) {
        yielded.push(event);
      }

      expect(yielded).toEqual(mockEvents);
    });

    it('should call onComplete once at stream end with accumulated tokens', async () => {
      const mockEvents = [
        {
          type: 'message_start',
          message: {
            usage: {
              input_tokens: 100,
              cache_read_input_tokens: 5,
            },
          },
        },
        { type: 'content_block_delta', delta: { text: 'Hello' } },
        { type: 'message_delta', usage: { output_tokens: 50 } },
      ];

      async function* mockStream() {
        for (const event of mockEvents) {
          yield event;
        }
      }

      const onComplete = vi.fn();
      const wrapped = wrapAnthropicStream(mockStream(), onComplete);

      for await (const event of wrapped) {
        // Consume stream
      }

      // Single call at end with accumulated values
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith({
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 5,
      });
    });

    it('should accumulate output_tokens from multiple message_delta events', async () => {
      const mockEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 100 } } },
        { type: 'message_delta', usage: { output_tokens: 25 } },
        { type: 'message_delta', usage: { output_tokens: 50 } },
      ];

      async function* mockStream() {
        for (const event of mockEvents) {
          yield event;
        }
      }

      const onComplete = vi.fn();
      const wrapped = wrapAnthropicStream(mockStream(), onComplete);

      for await (const event of wrapped) {
        // Consume stream
      }

      // Should use the last output_tokens value (Anthropic sends cumulative)
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith({
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 0,
      });
    });

    it('should call onComplete with zeros when no usage events', async () => {
      const mockEvents = [
        { type: 'content_block_delta', delta: { text: 'test' } },
        { type: 'content_block_delta', delta: { text: '!' } },
      ];

      async function* mockStream() {
        for (const event of mockEvents) {
          yield event;
        }
      }

      const onComplete = vi.fn();
      const wrapped = wrapAnthropicStream(mockStream(), onComplete);

      for await (const event of wrapped) {
        // Consume stream
      }

      // onComplete still called at stream end with zero values
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith({
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
      });
    });
  });

  describe('wrapGeminiStream', () => {
    it('should wrap stream correctly', async () => {
      const mockChunks = [
        { text: 'Hello' },
        { text: ' world' },
        { text: '!' },
      ];

      async function* mockStream() {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      }

      const mockResponse = {
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        },
      };

      const onComplete = vi.fn();
      const result = wrapGeminiStream(
        { stream: mockStream(), response: Promise.resolve(mockResponse) },
        onComplete
      );

      expect(result).toBeDefined();
      expect(result.stream).toBeDefined();

      const yielded = [];
      for await (const chunk of result.stream) {
        yielded.push(chunk);
      }

      expect(yielded).toEqual(mockChunks);
    });

    it('should call onComplete after response with usage metadata', async () => {
      async function* mockStream() {
        yield { text: 'test' };
      }

      const mockResponse = {
        usageMetadata: {
          promptTokenCount: 200,
          candidatesTokenCount: 100,
          totalTokenCount: 300,
        },
      };

      const onComplete = vi.fn();
      const result = wrapGeminiStream(
        { stream: mockStream(), response: Promise.resolve(mockResponse) },
        onComplete
      );

      for await (const chunk of result.stream) {
        // Consume stream
      }

      expect(onComplete).toHaveBeenCalledWith({
        promptTokenCount: 200,
        candidatesTokenCount: 100,
        totalTokenCount: 300,
      });
    });

    it('should not call onComplete if no usage metadata', async () => {
      async function* mockStream() {
        yield { text: 'test' };
      }

      const mockResponse = {
        // No usageMetadata
      };

      const onComplete = vi.fn();
      const result = wrapGeminiStream(
        { stream: mockStream(), response: Promise.resolve(mockResponse) },
        onComplete
      );

      for await (const chunk of result.stream) {
        // Consume stream
      }

      expect(onComplete).not.toHaveBeenCalled();
    });

    it('should preserve response promise', async () => {
      async function* mockStream() {
        yield { text: 'test' };
      }

      const mockResponseData = {
        text: 'final response',
        usageMetadata: {
          promptTokenCount: 50,
          candidatesTokenCount: 25,
          totalTokenCount: 75,
        },
      };

      const onComplete = vi.fn();
      const result = wrapGeminiStream(
        { stream: mockStream(), response: Promise.resolve(mockResponseData) },
        onComplete
      );

      // Consume stream first
      for await (const chunk of result.stream) {
        // Consume
      }

      const response = await result.response;
      expect(response).toEqual(mockResponseData);
    });

    it('should handle empty stream', async () => {
      async function* mockStream() {
        // Empty
      }

      const mockResponse = {
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      };

      const onComplete = vi.fn();
      const result = wrapGeminiStream(
        { stream: mockStream(), response: Promise.resolve(mockResponse) },
        onComplete
      );

      const yielded = [];
      for await (const chunk of result.stream) {
        yielded.push(chunk);
      }

      expect(yielded).toEqual([]);
      expect(onComplete).toHaveBeenCalled();
    });
  });
});
