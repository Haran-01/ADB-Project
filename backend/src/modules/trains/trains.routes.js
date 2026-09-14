import { Router } from 'express';
import { idSchema, listModel } from '../common/read-model.js';
export function trainRoutes(pool) {
  const router = Router();
  router.get('/', listModel(pool, 'trains', 'train_number'));
  router.get('/:id/schedule', async (req, res) => {
    const { rows } = await pool.query('select * from railway_main.fn_get_train_schedule($1::uuid)', [
      idSchema.parse(req.params.id),
    ]);
    res.json({ data: rows });
  });
  return router;
}
