import { Router } from 'express';
import { listModel } from '../common/read-model.js';
export function trackRoutes(pool) {
  const router = Router();
  router.get('/', listModel(pool, 'v_track_network', 'from_station_code,to_station_code'));
  return router;
}
