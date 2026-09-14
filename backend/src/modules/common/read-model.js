import { z } from 'zod';
export const idSchema = z.uuid();
export const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
// table/order values come exclusively from module constants, never request input.
export const listModel = (pool, table, order) => async (req, res) => {
  const { limit, offset } = pageSchema.parse(req.query);
  const { rows } = await pool.query(
    `select * from railway_main.${table} order by ${order} limit $1 offset $2`,
    [limit, offset],
  );
  res.json({ data: rows, limit, offset });
};
