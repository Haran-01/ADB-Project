import { Router } from 'express';
import { z } from 'zod';
import { createDisruption } from '../modules/disruptions/repository.js';

import { idSchema, pageSchema, listModel } from '../modules/common/read-model.js';
import { stationRoutes } from '../modules/stations/stations.routes.js';
import { trackRoutes } from '../modules/tracks/tracks.routes.js';
import { trainRoutes } from '../modules/trains/trains.routes.js';
import { journeyRoutes } from '../modules/journeys/journeys.routes.js';
import { networkRoutes } from '../modules/network/network.routes.js';
const disruptionSchema = z
  .object({
    type: z.enum(['TRACK_FAILURE', 'ACCIDENT', 'MAINTENANCE', 'STATION_CLOSURE', 'ROUTE_BLOCKAGE']),
    track_id: z.uuid().optional(),
    station_id: z.uuid().optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    description: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.track_id) !== Boolean(v.station_id),
    'Exactly one track_id or station_id is required',
  )
  .refine((v) => v.type !== 'TRACK_FAILURE' || !!v.track_id, 'Track failure requires track_id')
  .refine((v) => v.type !== 'STATION_CLOSURE' || !!v.station_id, 'Station closure requires station_id');

export function apiRoutes({ pool, graph, analysis }) {
  const router = Router();
  router.use('/stations', stationRoutes(pool));
  router.use('/tracks', trackRoutes(pool));
  router.use('/trains', trainRoutes(pool));
  router.use('/journeys', journeyRoutes(pool));
  router.use('/network', networkRoutes(pool));
  router.get('/disruptions', listModel(pool, 'disruptions', 'created_at desc,id'));
  router.get('/events', listModel(pool, 'event_log', 'event_sequence desc'));
  router.get('/disruptions/:id/progress', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const {
      rows: [disruption],
    } = await pool.query('select * from railway_main.disruptions where id=$1', [id]);
    if (!disruption) return res.status(404).json({ error: 'Disruption not found' });
    const { rows: events } = await pool.query(
      `select id,event_type,status,attempts,created_at,event_sequence,payload from railway_main.event_log
      where entity_id=$1 or payload->>'disruption_id'=$1::text order by event_sequence desc limit 50`,
      [id],
    );
    res.json({ data: { disruption, progress: analysis.progress?.get(id) ?? null, events } });
  });
  router.post('/disruptions', async (req, res) =>
    res.status(201).json({ data: await createDisruption(pool, disruptionSchema.parse(req.body)) }),
  );
  for (const [resource, table] of [
    ['affected-trains', 'affected_trains'],
    ['recommendations', 'route_recommendations'],
  ]) {
    router.get(`/disruptions/:id/${resource}`, async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const { limit, offset } = pageSchema.parse(req.query);
      const exists = await pool.query('select id from railway_main.disruptions where id=$1', [id]);
      if (!exists.rows.length) return res.status(404).json({ error: 'Disruption not found' });
      const { rows } = await pool.query(
        `select r.*,t.train_number,t.name as train_name from railway_main.${table} r
         join railway_main.train_journeys j on j.id=r.train_journey_id
         join railway_main.trains t on t.id=j.train_id
         where r.disruption_id=$1 order by r.created_at,r.id limit $2 offset $3`,
        [id, limit, offset],
      );
      res.json({ data: rows, limit, offset });
    });
  }
  router.post('/disruptions/:id/analyze', async (req, res) =>
    res.json({ data: await analysis.analyze(idSchema.parse(req.params.id)) }),
  );
  router.post('/recommendations/:id/apply', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    await pool.query('call railway_main.sp_apply_route_recommendation($1,$2)', [id, 'api-operator']);
    res.json({
      data: (await pool.query('select * from railway_main.route_recommendations where id=$1', [id])).rows[0],
    });
  });
  router.get('/routing/alternatives', async (req, res) => {
    const q = z
      .object({ from: z.string().regex(/^[A-Z0-9]{1,10}$/), to: z.string().regex(/^[A-Z0-9]{1,10}$/) })
      .parse(req.query);
    const candidates = await graph.routes(q.from, q.to);
    const routes = [];
    for (const route of candidates) {
      const {
        rows: [metrics],
      } = await pool.query('select * from railway_main.fn_validate_route($1::jsonb)', [
        JSON.stringify(route.stationCodes),
      ]);
      if (metrics.is_valid) routes.push({ ...route, ...metrics });
    }
    res.json({ data: routes });
  });
  return router;
}
