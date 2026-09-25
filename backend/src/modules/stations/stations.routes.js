import { Router } from 'express';
import { z } from 'zod';
import { listModel } from '../common/read-model.js';

export function stationRoutes(pool) {
  const router = Router();
  router.get('/', listModel(pool, 'stations', 'station_code'));

  // Fast autocomplete endpoint for station code & name search
  router.get('/autocomplete', async (req, res) => {
    const q = req.query.q ? String(req.query.q).trim() : '';
    if (!q) return res.json({ data: [] });

    const { rows } = await pool.query(
      `select station_code, name, zone, state
       from public.stations
       where station_code ilike $1 || '%' or name ilike '%' || $1 || '%'
       order by case when station_code ilike $1 || '%' then 0 else 1 end, station_code
       limit 200`,
      [q]
    );

    res.json({ data: rows });
  });

  // Detailed station information view
  router.get('/:code/details', async (req, res) => {
    const code = String(req.params.code).trim().toUpperCase();
    const { rows: [station] } = await pool.query(
      `select s.*, r.code as region_code, r.name as region_name
       from public.stations s
       join public.regions r on r.id = s.region_id
       where s.station_code = $1 or s.id::text = $1 or lower(s.name) = lower($2) or s.name ilike '%' || $2 || '%'
       order by case when lower(s.name) = lower($2) then 0 else 1 end
       limit 1`,
      [code, String(req.params.code).trim()]
    );

    if (!station) return res.status(404).json({ error: 'Station not found' });

    // Platform Count
    const { rows: [{ count: platformCount }] } = await pool.query(
      `select count(distinct platform)::int from public.train_schedules where station_id = $1 and platform is not null`,
      [station.id]
    );

    // Connected stations (Graph Edges from tracks)
    const { rows: connected } = await pool.query(
      `select distinct
         ts.id, ts.station_code, ts.name, tr.distance_km, tr.speed_limit_kmph, tr.status
       from public.tracks tr
       join public.stations ts on (ts.id = tr.to_station_id and tr.from_station_id = $1)
                                or (ts.id = tr.from_station_id and tr.to_station_id = $1)`,
      [station.id]
    );

    // Incoming & Outgoing Schedules
    const { rows: schedules } = await pool.query(
      `select
         t.id as train_id, t.train_number, t.name as train_name,
         ss.name as source_name, ds.name as dest_name,
         sch.stop_sequence, sch.scheduled_arrival, sch.scheduled_departure, sch.platform,
         case
           when tj.journey_status is null and t.status='RUNNING' then 'ON TIME'
           else coalesce(tj.journey_status::text, t.status::text, 'SCHEDULED')
         end as status
       from public.train_schedules sch
       join public.trains t on t.id = sch.train_id
       join public.stations ss on ss.id = t.source_station_id
       join public.stations ds on ds.id = t.destination_station_id
       left join lateral (
         select journey_status, delay_minutes from public.train_journeys j
         where j.train_id=t.id
         order by j.journey_date desc, j.created_at desc
         limit 1
       ) tj on true
       where sch.station_id = $1
       order by sch.scheduled_arrival nulls last, sch.scheduled_departure nulls last`,
      [station.id]
    );

    const incoming = schedules.filter(s => s.scheduled_arrival != null);
    const outgoing = schedules.filter(s => s.scheduled_departure != null);

    res.json({
      data: {
        station: {
          ...station,
          platform_count: platformCount > 0 ? platformCount : 4,
        },
        connected_stations: connected,
        incoming_trains: incoming,
        outgoing_trains: outgoing,
        schedules
      }
    });
  });

  router.get('/nearby', async (req, res) => {
    const q = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        radius_km: z.coerce.number().positive().max(500).default(50),
      })
      .parse(req.query);
    const { rows } = await pool.query(
      `select * from public.fn_find_nearby_stations(
      extensions.ST_SetSRID(extensions.ST_MakePoint($1,$2),4326)::extensions.geography,$3)`,
      [q.lng, q.lat, q.radius_km],
    );
    res.json({ data: rows });
  });

  return router;
}
