import { z } from 'zod';
import { DistributedQueryEngine } from '../../db/distributed.js';

export const idSchema = z.uuid();
export const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// table/order values come exclusively from module constants, never request input.
export const listModel = (pool, table, order) => async (req, res) => {
  const { limit, offset } = pageSchema.parse(req.query);
  const engine = new DistributedQueryEngine(pool);
  
  let rows = [];
  if (['stations', 'tracks', 'trains', 'train_schedules'].includes(table)) {
    // Distributed Scatter-Gather across regional node fragments (railway_south, railway_central, railway_north)
    rows = await engine.scatterGather(table, order, limit, offset);
  } else {
    const result = await pool.query(
      `select * from public.${table} order by ${order} limit $1 offset $2`,
      [limit, offset],
    );
    rows = result.rows;
  }
  
  res.json({ data: rows, limit, offset, distributed_retrieval: true });
};
