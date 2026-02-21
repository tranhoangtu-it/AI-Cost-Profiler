import { Router, type Router as RouterType } from 'express';
import { sseManager } from '../services/sse-manager.js';

export const streamRouter: RouterType = Router();

/**
 * GET /costs - Server-Sent Events stream for real-time cost updates
 */
streamRouter.get('/costs', (_req, res) => {
  sseManager.addClient(res);
});
