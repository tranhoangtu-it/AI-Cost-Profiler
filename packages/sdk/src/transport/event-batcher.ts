import type { LlmEvent } from '@ai-cost-profiler/shared';

/**
 * EventBatcher handles buffering and batch delivery of LLM events to the server
 * Flushes when buffer reaches batchSize or after flushIntervalMs timeout
 */
export class EventBatcher {
  private buffer: LlmEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;
  private readonly serverUrl: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxBufferSize = 1000;

  constructor(
    serverUrl: string,
    batchSize: number = 10,
    flushIntervalMs: number = 5000
  ) {
    this.serverUrl = serverUrl;
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;
    this.startTimer();
  }

  /**
   * Add event to buffer and flush if batch size reached
   */
  add(event: LlmEvent): void {
    this.buffer.push(event);

    // Cap buffer to prevent memory issues
    if (this.buffer.length > this.maxBufferSize) {
      console.warn(
        `[EventBatcher] Buffer exceeded ${this.maxBufferSize} events, dropping oldest`
      );
      this.buffer = this.buffer.slice(-this.maxBufferSize);
    }

    if (this.buffer.length >= this.batchSize) {
      void this.flush();
    }
  }

  /**
   * Flush buffered events to server
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing) return;

    this.flushing = true;
    const batch = this.buffer.splice(0, this.batchSize);

    try {
      const response = await fetch(`${this.serverUrl}/api/v1/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      // Graceful failure: re-buffer events and warn
      console.warn(
        '[EventBatcher] Failed to send events, re-buffering:',
        error instanceof Error ? error.message : String(error)
      );

      // Prepend failed batch back to buffer (with cap)
      this.buffer = [...batch, ...this.buffer].slice(0, this.maxBufferSize);
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Start interval timer for periodic flushing
   */
  private startTimer(): void {
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);

    // Unref timer to not block Node.js process exit
    this.timer.unref();
  }

  /**
   * Destroy batcher: clear timer and perform final flush
   */
  async destroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}
