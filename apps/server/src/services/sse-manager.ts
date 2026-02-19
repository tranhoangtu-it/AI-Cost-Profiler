import type { Response } from 'express';
import { subscriber, REDIS_KEYS } from '../lib/redis.js';
import { logger } from '../middleware/error-handler.js';

/**
 * SSE connection manager for real-time cost updates
 */
class SSEManager {
  private clients: Set<Response> = new Set();
  private isSubscribed = false;

  /**
   * Add SSE client and send initial connection message
   */
  addClient(res: Response): void {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Add to client set
    this.clients.add(res);

    // Send initial connection message
    this.sendToClient(res, {
      type: 'connected',
      data: { timestamp: new Date().toISOString() },
    });

    // Setup Redis subscription if first client
    if (!this.isSubscribed) {
      this.setupSubscription();
    }

    // Handle client disconnect
    res.on('close', () => {
      this.clients.delete(res);
      logger.info({ activeClients: this.clients.size }, 'SSE client disconnected');

      // Cleanup subscription if no clients
      if (this.clients.size === 0) {
        this.cleanup();
      }
    });

    logger.info({ activeClients: this.clients.size }, 'SSE client connected');
  }

  /**
   * Setup Redis pub/sub subscription
   */
  private setupSubscription(): void {
    subscriber.subscribe(REDIS_KEYS.SSE_CHANNEL, (err) => {
      if (err) {
        logger.error({ err }, 'Failed to subscribe to Redis channel');
        return;
      }

      this.isSubscribed = true;
      logger.info('Subscribed to Redis SSE channel');
    });

    subscriber.on('message', (channel, message) => {
      if (channel === REDIS_KEYS.SSE_CHANNEL) {
        try {
          const parsedMessage = JSON.parse(message);
          this.broadcast(parsedMessage);
        } catch (err) {
          logger.error({ err, message }, 'Failed to parse SSE message');
        }
      }
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: any): void {
    const deadClients: Response[] = [];

    for (const client of this.clients) {
      const success = this.sendToClient(client, message);
      if (!success) {
        deadClients.push(client);
      }
    }

    // Remove dead clients
    for (const client of deadClients) {
      this.clients.delete(client);
    }

    if (deadClients.length > 0) {
      logger.info({
        removed: deadClients.length,
        activeClients: this.clients.size
      }, 'Removed dead SSE clients');
    }
  }

  /**
   * Send message to single client
   */
  private sendToClient(client: Response, message: any): boolean {
    try {
      const data = JSON.stringify(message);
      client.write(`data: ${data}\n\n`);
      return true;
    } catch (err) {
      logger.error({ err }, 'Failed to send to SSE client');
      return false;
    }
  }

  /**
   * Cleanup subscription when no clients remain
   */
  private cleanup(): void {
    if (this.isSubscribed) {
      subscriber.unsubscribe(REDIS_KEYS.SSE_CHANNEL);
      this.isSubscribed = false;
      logger.info('Unsubscribed from Redis SSE channel');
    }
  }

  /**
   * Get count of active connections
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

// Singleton instance
export const sseManager = new SSEManager();
