import { Router } from 'express';
export function healthRoutes(pool, graph) {
  const router = Router();
  router.get('/', (_req, res) => res.json({ status: 'ok', service: 'railway-backend' }));
  router.get('/db', async (_req, res) => {
    try {
      await pool.query('select 1');
      res.json({ status: 'ok', database: 'postgresql' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'postgresql' });
    }
  });
  router.get('/neo4j', async (_req, res) => {
    try {
      await graph.health();
      res.json({ status: 'ok', database: 'neo4j' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'neo4j' });
    }
  });
  return router;
}
