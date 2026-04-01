import { Router } from 'express';
import * as queries from '../db/queries.js';

export function createStatsRouter(db) {
  const router = Router();
  router.get('/', (req, res) => {
    const stats = queries.getStats(db);
    res.json(stats);
  });
  return router;
}
