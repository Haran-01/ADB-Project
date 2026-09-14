import { Router } from 'express';
import { listModel } from '../common/read-model.js';
export function journeyRoutes(pool) {
  const router = Router();
  router.get('/active', listModel(pool, 'v_active_train_journeys', 'train_number'));
  return router;
}
