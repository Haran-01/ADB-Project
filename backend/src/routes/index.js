import { Router } from 'express';
import { z } from 'zod';
import { createDisruption } from '../modules/disruptions/repository.js';

import { idSchema, pageSchema, listModel } from '../modules/common/read-model.js';
import { stationRoutes } from '../modules/stations/stations.routes.js';
import { trackRoutes } from '../modules/tracks/tracks.routes.js';
import { trainRoutes } from '../modules/trains/trains.routes.js';
import { journeyRoutes } from '../modules/journeys/journeys.routes.js';
import { networkRoutes } from '../modules/network/network.routes.js';
import { adminRoutes } from '../modules/admin/admin.routes.js';
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
  router.post('/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (
      (username === 'admin' || username === 'admin@railway.gov') &&
      (password === 'admin123' || password === 'admin')
    ) {
      return res.json({
        data: {
          token: 'admin-session-token-12345',
          user: {
            id: 'usr-admin-1',
            username: 'admin',
            role: 'admin',
            name: 'Control Room Dispatcher',
          },
        },
      });
    }
    return res.status(401).json({ error: 'Invalid admin credentials' });
  });
  router.use('/admin', adminRoutes(pool));
  router.use('/stations', stationRoutes(pool));
  router.use('/tracks', trackRoutes(pool));
  router.use('/trains', trainRoutes(pool));
  router.use('/journeys', journeyRoutes(pool));
  router.use('/network', networkRoutes(pool));
  router.get('/disruptions', listModel(pool, 'disruptions', 'created_at desc,id'));
  router.get('/conflicts', listModel(pool, 'disruptions', 'created_at desc,id'));
  router.get('/conflicts/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const {
      rows: [conflict],
    } = await pool.query('select * from public.disruptions where id=$1', [id]);
    if (!conflict) return res.status(404).json({ error: 'Conflict not found' });
    const { rows: affected } = await pool.query(
      'select * from public.affected_trains where disruption_id=$1 order by created_at,id',
      [id],
    );
    const { rows: recommendations } = await pool.query(
      'select * from public.route_recommendations where disruption_id=$1 order by created_at,id',
      [id],
    );
    res.json({ data: { conflict, affected, recommendations } });
  });
  router.get('/disruptions/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const {
      rows: [disruption],
    } = await pool.query('select * from public.disruptions where id=$1', [id]);
    if (!disruption) return res.status(404).json({ error: 'Disruption not found' });
    res.json({ data: disruption });
  });
  router.get('/events', listModel(pool, 'event_log', 'event_sequence desc'));
  router.get('/disruptions/:id/progress', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const {
      rows: [disruption],
    } = await pool.query('select * from public.disruptions where id=$1', [id]);
    if (!disruption) return res.status(404).json({ error: 'Disruption not found' });
    const { rows: events } = await pool.query(
      `select id,event_type,status,attempts,created_at,event_sequence,payload from public.event_log
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
      const exists = await pool.query('select id from public.disruptions where id=$1', [id]);
      if (!exists.rows.length) return res.status(404).json({ error: 'Disruption not found' });
      const { rows } = await pool.query(
        `select * from public.${table} where disruption_id=$1 order by created_at,id limit $2 offset $3`,
        [id, limit, offset],
      );
      res.json({ data: rows, limit, offset });
    });
  }
  router.post('/disruptions/:id/analyze', async (req, res) =>
    res.json({ data: await analysis.analyze(idSchema.parse(req.params.id)) }),
  );
  router.get('/regional/stats', async (_req, res) => {
    const regions = ['railway_south', 'railway_central', 'railway_north'];
    const stats = {};
    for (const reg of regions) {
      const code = reg === 'railway_south' ? 'SOUTH' : reg === 'railway_central' ? 'CENTRAL' : 'NORTH';
      const {
        rows: [{ count: stations }],
      } = await pool.query(`select count(*)::int from ${reg}.stations`);
      const {
        rows: [{ count: tracks }],
      } = await pool.query(`select count(*)::int from ${reg}.tracks`);
      const {
        rows: [{ count: trains }],
      } = await pool.query(`select count(*)::int from ${reg}.trains`);
      const {
        rows: [{ count: schedules }],
      } = await pool.query(`select count(*)::int from ${reg}.train_schedules`);
      stats[code] = { schema: reg, stations, tracks, trains, schedules, status: 'ONLINE' };
    }
    res.json({ data: stats });
  });

  router.get('/platforms', async (_req, res) => {
    const { rows: schedules } = await pool.query(`
      select
        sch.id, sch.platform, sch.scheduled_arrival, sch.scheduled_departure, sch.stop_sequence,
        s.station_code, s.name as station_name,
        t.train_number, t.name as train_name
      from public.train_schedules sch
      join public.stations s on s.id = sch.station_id
      join public.trains t on t.id = sch.train_id
      where sch.platform is not null
      order by s.station_code, sch.platform, sch.scheduled_arrival
    `);

    const toMinutes = (value) => {
      if (!value) return null;
      const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
      return hours * 60 + minutes;
    };
    const occupancy = (row) => {
      const arrival = toMinutes(row.scheduled_arrival);
      const departure = toMinutes(row.scheduled_departure);
      if (arrival == null && departure == null) return null;
      if (arrival == null) return [departure, departure + 10];
      if (departure == null) return [arrival - 10, arrival];
      return [arrival, departure < arrival ? departure + 24 * 60 : departure];
    };

    // Detect conflicts only when platform assignments overlap at the same station.
    const conflicts = [];
    for (let i = 0; i < schedules.length; i++) {
      for (let j = i + 1; j < schedules.length; j++) {
        const s1 = schedules[i];
        const s2 = schedules[j];
        const w1 = occupancy(s1);
        const w2 = occupancy(s2);
        const overlaps = w1 && w2 && w1[0] < w2[1] && w2[0] < w1[1];
        if (
          s1.station_code === s2.station_code &&
          s1.platform === s2.platform &&
          s1.train_number !== s2.train_number &&
          overlaps
        ) {
          conflicts.push({
            id: `plt-cfl-${i}-${j}`,
            station_code: s1.station_code,
            station_name: s1.station_name,
            platform: s1.platform,
            train_a: s1.train_number,
            train_b: s2.train_number,
            time_window: `${s1.scheduled_arrival || s1.scheduled_departure} - ${s2.scheduled_arrival || s2.scheduled_departure}`,
            status: 'CONFLICT',
          });
        }
      }
    }

    res.json({ data: { schedules, conflicts } });
  });

  router.get('/schedules', listModel(pool, 'v_train_schedule_ordered', 'train_number,stop_sequence'));

  router.post('/recommendations/:id/apply', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    await pool.query('call public.sp_apply_route_recommendation($1,$2)', [id, 'api-operator']);
    res.json({
      data: (await pool.query('select * from public.route_recommendations where id=$1', [id])).rows[0],
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
      } = await pool.query('select * from public.fn_validate_route($1::jsonb)', [
        JSON.stringify(route.stationCodes),
      ]);
      if (metrics.is_valid) routes.push({ ...route, ...metrics });
    }
    res.json({ data: routes });
  });
  return router;
}
