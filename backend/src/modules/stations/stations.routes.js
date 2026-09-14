import { Router } from 'express';
import { z } from 'zod';
import { listModel } from '../common/read-model.js';
export function stationRoutes(pool) {
  const router = Router();
  router.get('/', listModel(pool, 'stations', 'station_code'));
  router.get('/nearby', async (req, res) => {
    const q = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        radius_km: z.coerce.number().positive().max(500).default(50),
      })
      .parse(req.query);
    const { rows } = await pool.query(
      `select * from railway_main.fn_find_nearby_stations(
      extensions.ST_SetSRID(extensions.ST_MakePoint($1,$2),4326)::extensions.geography,$3)`,
      [q.lng, q.lat, q.radius_km],
    );
    res.json({ data: rows });
  });
  return router;
}
