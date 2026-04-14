import { Router } from 'express';
import * as queries from '../db/queries.js';

export function createStatsRouter(db) {
  const router = Router();
  router.get('/', async (req, res) => {
    const stats = await queries.getStats(db);
    res.json(stats);
  });
  return router;
}
