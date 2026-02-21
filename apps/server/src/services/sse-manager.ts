import type { Response } from 'express';
import { redis, subscriber, REDIS_KEYS } from '../lib/redis.js';
import { logger } from '../middleware/error-handler.js';

/**
 * SSE connection manager for real-time cost updates
 * Includes heartbeat to keep connections alive through proxies/load balancers
 */
class SSEManager {
  private clients: Set<Response> = new Set();
  private isSubscribed = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly maxClients = 100;
  private readonly heartbeatIntervalMs = 30_000; // 30s — below typical proxy timeout of 60s

  /**
   * Add SSE client and send initial connection message
   */
  async addClient(res: Response): Promise<void> {
    // Reject if at capacity
    if (this.clients.size >= this.maxClients) {
      logger.warn({ activeClients: this.clients.size, maxClients: this.maxClients }, 'SSE connection limit reached');
      res.status(503).json({ error: 'Too many SSE connections' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Add to client set
    this.clients.add(res);

    // Send snapshot with current Redis totals
    const totalCost = parseFloat(await redis.get(REDIS_KEYS.TOTAL_COST) || '0');
    this.sendToClient(res, {
      type: 'snapshot',
      totalCost,
      timestamp: new Date().toISOString(),
    });

    // Setup Redis subscription and heartbeat if first client
    if (!this.isSubscribed) {
      this.setupSubscription();
      this.startHeartbeat();
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
   * Start heartbeat timer to keep connections alive through proxies
   * Sends SSE comment (: keepalive) which clients ignore but proxies see as activity
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const deadClients: Response[] = [];

      for (const client of this.clients) {
        try {
          client.write(': keepalive\n\n');
        } catch {
          deadClients.push(client);
        }
      }

      // Remove dead clients discovered during heartbeat
      for (const client of deadClients) {
        this.clients.delete(client);
      }

      if (deadClients.length > 0) {
        logger.info({
          removed: deadClients.length,
          activeClients: this.clients.size,
        }, 'Removed dead SSE clients during heartbeat');
      }
    }, this.heartbeatIntervalMs);

    this.heartbeatTimer.unref();
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: unknown): void {
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
  private sendToClient(client: Response, message: unknown): boolean {
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
   * Cleanup subscription and heartbeat when no clients remain
   */
  private cleanup(): void {
    if (this.isSubscribed) {
      subscriber.unsubscribe(REDIS_KEYS.SSE_CHANNEL);
      this.isSubscribed = false;
      logger.info('Unsubscribed from Redis SSE channel');
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
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
