import { Router } from 'express';
export function networkRoutes(pool) {
  const router = Router();
  router.get('/map', async (_req, res) => {
    const {
      rows: [row],
    } = await pool.query('select public.fn_network_geojson() as geojson');
    res.json(row.geojson);
  });
  return router;
}
