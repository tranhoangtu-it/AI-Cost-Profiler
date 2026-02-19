import 'dotenv/config';
import { createApp } from './app.js';
import { connectRedis, initializeRedis, disconnectRedis } from './lib/redis.js';
import { pool } from './db/index.js';
import { logger } from './middleware/error-handler.js';

const PORT = process.env.PORT || 3001;

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    // Connect to Redis
    logger.info('Connecting to Redis...');
    await connectRedis();
    await initializeRedis();
    logger.info('Redis connected and initialized');

    // Test database connection
    logger.info('Testing database connection...');
    await pool.query('SELECT NOW()');
    logger.info('Database connected');

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Server started');
    });

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      logger.info('Shutting down gracefully...');

      server.close(async () => {
        await Promise.all([
          disconnectRedis(),
          pool.end(),
        ]);

        logger.info('Server shut down');
        process.exit(0);
      });

      // Force shutdown after 10s
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();
