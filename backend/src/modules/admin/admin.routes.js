import { Router } from 'express';
import { z } from 'zod';
import { transaction } from '../../../../scripts/lib/database.mjs';

const REGION_SCHEMAS = ['railway_south', 'railway_central', 'railway_north'];
const AVAILABLE_TRACK_STATUSES = new Set(['ACTIVE']);
const REGION_CODES_BY_SCHEMA = {
  railway_south: 'SR',
  railway_central: 'CR',
  railway_north: 'NR',
};

const stationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,10}$/);
const routeQuerySchema = z
  .object({
    source: stationCodeSchema,
    destination: stationCodeSchema,
    mode: z.enum(['shortest', 'duration', 'hops']).default('shortest'),
  })
  .strict();
const graphQuerySchema = z
  .object({
    region: z.string().trim().toUpperCase().optional(),
    status: z.string().trim().toUpperCase().optional(),
  })
  .strict();
const conflictSchema = z
  .object({
    conflictType: z
      .enum(['TRACK_FAILURE', 'ACCIDENT', 'MAINTENANCE', 'STATION_CLOSURE', 'ROUTE_BLOCKAGE'])
      .default('TRACK_FAILURE'),
    trackId: z.uuid().optional(),
    stationId: z.uuid().optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    title: z.string().trim().min(1).max(160),
    description: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .default('Track disruption reported by admin')
      .optional(),
    expectedDuration: z.string().trim().max(80).optional(),
    note: z.string().trim().max(1000).optional(),
    autoAllocate: z.boolean().default(true).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.trackId) !== Boolean(v.stationId), {
    message: 'Exactly one trackId or stationId is required',
  })
  .refine(v => v.conflictType !== 'TRACK_FAILURE' || !!v.trackId, 'Track failure requires trackId')
  .refine(v => v.conflictType !== 'STATION_CLOSURE' || !!v.stationId, 'Station closure requires stationId');
const resolveConflictSchema = z
  .object({
    resolutionNote: z
      .string()
      .trim()
      .max(2000)
      .default('Track repairs completed. Regular operations restored.')
      .optional(),
    restoreStatus: z.enum(['ACTIVE', 'FAILED', 'MAINTENANCE', 'BLOCKED']).default('ACTIVE'),
  })
  .strict();

function graphVersion() {
  return new Date().toISOString();
}

function regionLabel(schemaOrCode) {
  const value = String(schemaOrCode ?? '').toUpperCase();
  if (value.includes('SOUTH') || value === 'SR') return 'South';
  if (value.includes('CENTRAL') || value === 'CR') return 'Central';
  if (value.includes('NORTH') || value === 'NR') return 'North';
  return value || 'Unknown';
}

async function aggregateGraph(pool, filters = {}) {
  const stationUnion = REGION_SCHEMAS.map(
    (schema) => `
      select s.id, s.station_code, s.name, s.region_id, s.latitude, s.longitude, s.status,
             coalesce(r.code, '${REGION_CODES_BY_SCHEMA[schema]}') as region_code,
             coalesce(r.name, '${regionLabel(schema)}') as region_name,
             '${schema}' as source_schema
      from ${schema}.stations s
      left join ${schema}.regions r on r.id = s.region_id
    `,
  ).join('\nunion all\n');
  const trackUnion = REGION_SCHEMAS.map(
    (schema) => `
      select t.id, t.from_station_id, t.to_station_id, t.distance_km, t.speed_limit_kmph, t.status,
             coalesce(r.code, '${REGION_CODES_BY_SCHEMA[schema]}') as region_code,
             coalesce(r.name, '${regionLabel(schema)}') as region_name,
             '${schema}' as source_schema
      from ${schema}.tracks t
      left join ${schema}.regions r on r.id = t.region_id
    `,
  ).join('\nunion all\n');
  const [stationsResult, tracksResult] = await Promise.all([
    pool.query(`select * from (${stationUnion}) stations where status = 'ACTIVE' order by station_code`),
    pool.query(`select * from (${trackUnion}) tracks order by id`),
  ]);

  const stationsByCode = new Map();
  for (const station of stationsResult.rows) {
    if (
      filters.region &&
      station.region_code !== filters.region &&
      regionLabel(station.region_name).toUpperCase() !== filters.region
    ) {
      continue;
    }
    const existing = stationsByCode.get(station.station_code);
    if (existing) {
      existing.regionOwners = [...new Set([...existing.regionOwners, station.region_code].filter(Boolean))];
      continue;
    }
    stationsByCode.set(station.station_code, {
      id: station.id,
      code: station.station_code,
      name: station.name,
      region: regionLabel(station.region_name ?? station.region_code),
      regionCode: station.region_code,
      latitude: Number(station.latitude),
      longitude: Number(station.longitude),
      status: station.status,
      active: station.status === 'ACTIVE',
      regionOwners: [station.region_code].filter(Boolean),
    });
  }

  const stationIdToCode = new Map(stationsResult.rows.map((s) => [String(s.id), s.station_code]));
  const edgesByEndpoints = new Map();
  for (const track of tracksResult.rows) {
    if (filters.status && track.status !== filters.status) continue;
    const sourceCode = stationIdToCode.get(String(track.from_station_id));
    const targetCode = stationIdToCode.get(String(track.to_station_id));
    if (!sourceCode || !targetCode || !stationsByCode.has(sourceCode) || !stationsByCode.has(targetCode))
      continue;
    const key = `${sourceCode}->${targetCode}`;
    if (edgesByEndpoints.has(key)) continue;
    const distanceKm = Number(track.distance_km);
    edgesByEndpoints.set(key, {
      id: track.id,
      source: stationsByCode.get(sourceCode).id,
      target: stationsByCode.get(targetCode).id,
      sourceCode,
      targetCode,
      distanceKm,
      travelTimeMinutes: Math.max(
        1,
        Math.round((distanceKm / Math.max(1, track.speed_limit_kmph || 80)) * 60),
      ),
      direction: 'ONE_WAY',
      status: track.status,
      region: regionLabel(track.region_name ?? track.region_code),
      regionCode: track.region_code,
      sourceSchema: track.source_schema,
    });
  }

  return {
    nodes: [...stationsByCode.values()],
    edges: [...edgesByEndpoints.values()],
    graphVersion: graphVersion(),
  };
}

function calculateRoute(graph, sourceCode, destinationCode, mode) {
  const source = graph.nodes.find((n) => n.code === sourceCode);
  const destination = graph.nodes.find((n) => n.code === destinationCode);
  if (!source || !destination) return { available: false, reason: 'Station not found' };
  if (source.code === destination.code)
    return { available: false, reason: 'Source and destination must differ' };

  const adjacency = new Map(graph.nodes.map((node) => [node.code, []]));
  for (const edge of graph.edges) {
    if (!AVAILABLE_TRACK_STATUSES.has(edge.status)) continue;
    adjacency.get(edge.sourceCode)?.push(edge);

  }
  for (const edges of adjacency.values()) {
    edges.sort((a, b) => a.targetCode.localeCompare(b.targetCode) || a.id.localeCompare(b.id));
  }

  const distances = new Map(graph.nodes.map((node) => [node.code, Infinity]));
  const previous = new Map();
  const visited = new Set();
  distances.set(source.code, 0);

  while (visited.size < graph.nodes.length) {
    const current = [...distances.entries()]
      .filter(([code]) => !visited.has(code))
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
    if (!current || current[1] === Infinity) break;
    const [code] = current;
    if (code === destination.code) break;
    visited.add(code);

    for (const edge of adjacency.get(code) ?? []) {
      const weight = mode === 'hops' ? 1 : mode === 'duration' ? edge.travelTimeMinutes : edge.distanceKm;
      const nextScore = distances.get(code) + weight;
      if (nextScore < distances.get(edge.targetCode)) {
        distances.set(edge.targetCode, nextScore);
        previous.set(edge.targetCode, { code, edge });
      }
    }
  }

  if (!previous.has(destination.code)) return { available: false, reason: 'No route available' };

  const orderedEdges = [];
  const orderedCodes = [destination.code];
  let cursor = destination.code;
  while (cursor !== source.code) {
    const step = previous.get(cursor);
    if (!step) return { available: false, reason: 'No route available' };
    orderedEdges.unshift(step.edge);
    orderedCodes.unshift(step.code);
    cursor = step.code;
  }

  const stations = orderedCodes.map((code) => graph.nodes.find((node) => node.code === code));
  const totalDistanceKm = orderedEdges.reduce((sum, edge) => sum + edge.distanceKm, 0);
  const estimatedDurationMinutes = orderedEdges.reduce((sum, edge) => sum + edge.travelTimeMinutes, 0);
  return {
    available: true,
    stations,
    edges: orderedEdges,
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    estimatedDurationMinutes,
    stopCount: stations.length,
    regionsCrossed: [...new Set(stations.map((station) => station.region))],
    excludedTrackStatuses: ['FAILED', 'MAINTENANCE', 'BLOCKED', 'CLOSED', 'CONFLICTED'],
  };
}

async function getRegions(pool) {
  const graph = await aggregateGraph(pool);
  const regionCounts = await Promise.all(
    REGION_SCHEMAS.map((schema) =>
      pool
        .query(
          `select '${schema}' as schema,
                  count(distinct s.id)::int as stations,
                  (select count(*)::int from ${schema}.tracks) as tracks,
                  (select count(*)::int from ${schema}.trains where status='RUNNING') as active_trains,
                  (select count(*)::int from ${schema}.disruptions where status='OPEN') as open_conflicts
           from ${schema}.stations s`,
        )
        .then((r) => r.rows[0])
,
    ),
  );

  const grouped = new Map();
  for (const row of regionCounts) {
    const code = REGION_CODES_BY_SCHEMA[row.schema];
    grouped.set(code, {
      code,
      name: regionLabel(code),
      stations: row.stations,
      tracks: row.tracks,
      activeTrains: row.active_trains,
      openConflicts: row.open_conflicts,
      connectedRegions: new Set(),
    });
  }
  for (const edge of graph.edges) {
    const source = graph.nodes.find((n) => n.id === edge.source);
    const target = graph.nodes.find((n) => n.id === edge.target);
    const sourceKey = source?.regionCode ?? source?.region?.toUpperCase();
    const targetKey = target?.regionCode ?? target?.region?.toUpperCase();
    if (sourceKey && targetKey && sourceKey !== targetKey) {
      grouped.get(sourceKey)?.connectedRegions.add(target?.region ?? targetKey);
      grouped.get(targetKey)?.connectedRegions.add(source?.region ?? sourceKey);
    }
  }
  return [...grouped.values()].map((region) => ({
    ...region,
    connectedRegions: [...region.connectedRegions],
    status: 'ONLINE',
  }));
}

export function adminRoutes(pool, requireAdmin) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/graph', async (req, res) => {
    const filters = graphQuerySchema.parse(req.query);
    res.json({ data: await aggregateGraph(pool, filters) });
  });

  router.get('/graph/stations/search', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json({ data: [] });
    const { nodes } = await aggregateGraph(pool);
    const needle = q.toLowerCase();
    res.json({
      data: nodes
        .filter(
          (node) => node.code.toLowerCase().includes(needle) || node.name.toLowerCase().includes(needle),
        )
        .slice(0, 20),
    });
  });

  router.get('/graph/route', async (req, res) => {
    const q = routeQuerySchema.parse(req.query);
    const graph = await aggregateGraph(pool);
    res.json({ data: calculateRoute(graph, q.source, q.destination, q.mode) });
  });

  router.get('/regions', async (_req, res) => {
    res.json({ data: await getRegions(pool) });
  });

  router.get('/stations/:stationCode', async (req, res) => {
    const code = stationCodeSchema.parse(req.params.stationCode);
    const graph = await aggregateGraph(pool);
    const station = graph.nodes.find((node) => node.code === code);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    const connections = graph.edges.filter(
      (edge) => edge.source === station.id || edge.target === station.id,
    );
    res.json({ data: { station, connections } });
  });

  router.get('/conflicts', async (req, res) => {
    const status = String(req.query.status ?? 'OPEN').toUpperCase();
    const { rows } = await pool.query(
      `select d.*,
              fs.station_code as from_station, fs.name as from_station_name,
              ts.station_code as to_station, ts.name as to_station_name,
              s.station_code as station_code, s.name as station_name,
              coalesce((select count(*)::int from public.affected_trains at where at.disruption_id = d.id), 0) as affected_count
       from public.disruptions d
       left join public.tracks t on t.id = d.track_id
       left join public.stations fs on fs.id = t.from_station_id
       left join public.stations ts on ts.id = t.to_station_id
       left join public.stations s on s.id = d.station_id
       where ($1 = 'ALL' or d.status::text = $1)
       order by d.created_at desc`,
      [status],
    );
    res.json({ data: rows });
  });

  router.get('/tracks', async (_req, res) => {
    const { rows } = await pool.query(`
      select
        tr.id,
        tr.status,
        tr.distance_km,
        tr.track_type,
        tr.speed_limit_kmph,
        coalesce(r.code, 'SR') as region_code,
        coalesce(r.name, 'South') as region_name,
        fs.id as from_station_id,
        fs.station_code as from_station_code,
        fs.name as from_station_name,
        ts.id as to_station_id,
        ts.station_code as to_station_code,
        ts.name as to_station_name
      from public.tracks tr
      join public.stations fs on fs.id = tr.from_station_id
      join public.stations ts on ts.id = tr.to_station_id
      left join public.regions r on r.id = tr.region_id
      order by r.code, fs.station_code, ts.station_code
    `);
    res.json({ data: rows });
  });

  router.post('/conflicts', async (req, res) => {
    const body = conflictSchema.parse(req.body);
    const client = await pool.connect();
    try {
      const result = await transaction(client, async () => {
        await client.query("select pg_advisory_xact_lock(hashtext('railway:disruption-write'))");
    const description = [
      body.title,
      body.description,
      body.expectedDuration ? `Expected duration: ${body.expectedDuration}` : null,
      body.note ? `Note: ${body.note}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    let damagedTrack = null;
    if (body.trackId) {
      const { rows: trackRows } = await client.query(
        `select tr.id, tr.from_station_id, tr.to_station_id, tr.distance_km, tr.speed_limit_kmph, tr.status,
                fs.station_code as from_code, fs.name as from_name,
                ts.station_code as to_code, ts.name as to_name
         from public.tracks tr
         join public.stations fs on fs.id = tr.from_station_id
         join public.stations ts on ts.id = tr.to_station_id
         where tr.id = $1`,
        [body.trackId],
      );
      damagedTrack = trackRows[0] || null;
    }

    const target = body.trackId ?? body.stationId;
    const targetTable = body.trackId ? 'tracks' : 'stations';
    const found = await client.query(`select id from public.${targetTable} where id=$1`, [target]);
    if (!found.rows.length) throw Object.assign(new Error('Target not found'), { status: 404 });
    const existing = await client.query(`select d.id from public.disruptions d
      left join public.tracks t on t.id=d.track_id
      where d.status in ('OPEN','ANALYZING') and
        (d.track_id=$1 or d.station_id=$1 or
          (t.from_station_id=$2 and t.to_station_id=$3) or
          (t.from_station_id=$3 and t.to_station_id=$2))`,
      [target, damagedTrack?.from_station_id ?? null, damagedTrack?.to_station_id ?? null]);
    if (existing.rows.length) throw Object.assign(new Error('Target already has an unresolved disruption'), { status: 409 });

    const { rows } = await client.query(
      `insert into public.disruptions (type, track_id, station_id, severity, reported_by, description, status)
       values ($1,$2,$3,$4,$5,$6,'OPEN')
       returning *`,
      [body.conflictType, body.trackId ?? null, body.stationId ?? null, body.severity, 'admin', description],
    );

    if (body.trackId && damagedTrack) {
      await Promise.all(
        REGION_SCHEMAS.map((schema) =>
          client.query(
            `update ${schema}.tracks set status='BLOCKED', updated_at=now()
             where (from_station_id = $1 and to_station_id = $2)
                or (from_station_id = $2 and to_station_id = $1)`,
            [damagedTrack.from_station_id, damagedTrack.to_station_id],
          ),
        ),
      );
    } else if (body.trackId) {
      await Promise.all(
        REGION_SCHEMAS.map((schema) =>
          client.query(`update ${schema}.tracks set status='BLOCKED', updated_at=now() where id=$1`, [
            body.trackId,
          ]),
        ),
      );
    }
    if (body.stationId && body.conflictType === 'STATION_CLOSURE') {
      await client.query(`update public.stations set status='CLOSED', updated_at=now() where id=$1`, [
        body.stationId,
      ]);
    }

    const reroutedJourneys = [];
    if (body.trackId && body.autoAllocate !== false && damagedTrack) {
      // Fetch all running or scheduled train journeys
      const { rows: journeys } = await client.query(`
        select tj.id as journey_id, tj.train_id, tj.journey_status, tj.delay_minutes,
               t.train_number, t.name as train_name,
               coalesce(tj.active_route, (
                 select jsonb_agg(st.station_code order by sch.stop_sequence)
                 from public.train_schedules sch
                 join public.stations st on st.id = sch.station_id
                 where sch.train_id = tj.train_id
               )) as current_route,
               cs.station_code as current_code,
               ds.station_code as dest_code
        from public.train_journeys tj
        join public.trains t on t.id = tj.train_id
        left join public.stations cs on cs.id = tj.current_station_id
        left join public.stations ds on ds.id = t.destination_station_id
        where tj.journey_status in ('RUNNING', 'SCHEDULED', 'DELAYED')
      `);

      // Rebuild graph for Dijkstra with the damaged track corridor strictly removed
      const graph = await aggregateGraph(client);
      graph.edges = graph.edges.filter(
        (e) =>
          e.id !== body.trackId &&
          !(
            (e.sourceCode === damagedTrack.from_code && e.targetCode === damagedTrack.to_code) ||
            (e.sourceCode === damagedTrack.to_code && e.targetCode === damagedTrack.from_code)
          ) &&
          AVAILABLE_TRACK_STATUSES.has(e.status),
      );

      for (const j of journeys) {
        const rawRoute = Array.isArray(j.current_route)
          ? j.current_route
          : JSON.parse(j.current_route || '[]');

        if (!rawRoute || rawRoute.length < 2) continue;

        let traverseIndex = -1;
        for (let i = Math.max(0, rawRoute.indexOf(j.current_code)); i < rawRoute.length - 1; i++) {
          if (
            (rawRoute[i] === damagedTrack.from_code && rawRoute[i + 1] === damagedTrack.to_code) ||
            (rawRoute[i] === damagedTrack.to_code && rawRoute[i + 1] === damagedTrack.from_code)
          ) {
            traverseIndex = i;
            break;
          }
        }

        if (traverseIndex !== -1) {
          const startNode = rawRoute[traverseIndex];
          const nextNode = rawRoute[traverseIndex + 1];
          const prevNode = traverseIndex > 0 ? rawRoute[traverseIndex - 1] : null;
          const afterNode = traverseIndex + 2 < rawRoute.length ? rawRoute[traverseIndex + 2] : null;

          let dijkstraResult = null;
          let newAllocatedRoute = null;
          let bypassCodes = [];
          let delayAdded = 0;

          // Strategy 1: Forward bypass to subsequent station (e.g. MAS -> KPD direct, avoiding AJJ)
          if (afterNode) {
            const detour = calculateRoute(graph, startNode, afterNode, 'shortest');
            if (detour.available && detour.stations.length >= 2) {
              dijkstraResult = detour;
              bypassCodes = detour.stations.map((s) => s.code);
              newAllocatedRoute = [
                ...rawRoute.slice(0, traverseIndex),
                ...bypassCodes,
                ...rawRoute.slice(traverseIndex + 3),
              ];
              delayAdded = Math.max(8, Math.round(detour.estimatedDurationMinutes * 0.3));
            }
          }

          // Strategy 2: Reverse/inbound bypass from previous station (e.g. KPD -> MAS direct, avoiding AJJ)
          if (!newAllocatedRoute && prevNode && prevNode !== j.current_code && rawRoute.indexOf(j.current_code) < traverseIndex) {
            const detour = calculateRoute(graph, prevNode, nextNode, 'shortest');
            if (detour.available && detour.stations.length >= 2) {
              dijkstraResult = detour;
              bypassCodes = detour.stations.map((s) => s.code);
              newAllocatedRoute = [
                ...rawRoute.slice(0, traverseIndex - 1),
                ...bypassCodes,
                ...rawRoute.slice(traverseIndex + 2),
              ];
              delayAdded = Math.max(8, Math.round(detour.estimatedDurationMinutes * 0.3));
            }
          }

          // Strategy 3: Direct segment bypass (e.g. MAS -> CGL -> KPD -> AJJ)
          if (!newAllocatedRoute) {
            const detour = calculateRoute(graph, startNode, nextNode, 'shortest');
            if (detour.available && detour.stations.length >= 2) {
              dijkstraResult = detour;
              bypassCodes = detour.stations.map((s) => s.code);
              newAllocatedRoute = [
                ...rawRoute.slice(0, traverseIndex),
                ...bypassCodes,
                ...rawRoute.slice(traverseIndex + 2),
              ];
              delayAdded = Math.max(8, Math.round(detour.estimatedDurationMinutes * 0.35));
            }
          }

          // Strategy 4: Destination bypass
          if (!newAllocatedRoute) {
            const finalDest = rawRoute.at(-1);
            if (startNode !== finalDest) {
              const detour = calculateRoute(graph, startNode, finalDest, 'shortest');
              if (detour.available) {
                dijkstraResult = detour;
                bypassCodes = detour.stations.map((s) => s.code);
                newAllocatedRoute = [...rawRoute.slice(0, traverseIndex), ...bypassCodes];
                delayAdded = Math.max(12, Math.round(detour.estimatedDurationMinutes * 0.25));
              }
            }
          }

          if (newAllocatedRoute && newAllocatedRoute.length > 0) {
            const cleanRoute = newAllocatedRoute.filter(
              (code, idx) => idx === 0 || code !== newAllocatedRoute[idx - 1],
            );

            // Ensure both current_station_id and next_station_id belong to active_route for trigger consistency
            let currentStationCode = null;
            let nextStationCode = null;
            if (j.current_code && cleanRoute.includes(j.current_code)) {
              currentStationCode = j.current_code;
              const cIdx = cleanRoute.indexOf(j.current_code);
              nextStationCode = cIdx < cleanRoute.length - 1 ? cleanRoute[cIdx + 1] : cleanRoute[cIdx];
            } else if (cleanRoute.length > 1) {
              currentStationCode = cleanRoute[0];
              nextStationCode = cleanRoute[1];
            } else if (cleanRoute.length > 0) {
              currentStationCode = cleanRoute[0];
              nextStationCode = cleanRoute[0];
            }

            // Re-allocate train to the newly calculated track route in database
            await client.query(
              `update public.train_journeys
               set active_route = $1::jsonb,
                   current_station_id = coalesce((select id from public.stations where station_code = $2), current_station_id),
                   next_station_id = coalesce((select id from public.stations where station_code = $3), next_station_id),
                   journey_status = 'REROUTED',
                   delay_minutes = coalesce(delay_minutes, 0) + $4,
                   updated_at = now()
               where id = $5`,
              [JSON.stringify(cleanRoute), currentStationCode, nextStationCode, delayAdded, j.journey_id],
            );

            // Record in affected_trains
            await client.query(
              `call public.sp_record_affected_train($1,$2,'DIRECT_TRACK_BLOCK',$3,'REROUTED')`,
              [rows[0].id, j.journey_id, delayAdded],
            );

            // Record recommendation as applied
            await client.query(
              `insert into public.route_recommendations
               (disruption_id, train_journey_id, original_route, recommended_route, distance_km, estimated_travel_minutes, estimated_delay_minutes, score, status)
               values ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, 100, 'APPLIED')`,
              [
                rows[0].id,
                j.journey_id,
                JSON.stringify(rawRoute),
                JSON.stringify(cleanRoute),
                dijkstraResult.totalDistanceKm || 0,
                dijkstraResult.estimatedDurationMinutes || 0,
                delayAdded,
              ],
            );

            reroutedJourneys.push({
              journeyId: j.journey_id,
              trainNumber: j.train_number,
              trainName: j.train_name,
              originalRoute: rawRoute,
              allocatedRoute: cleanRoute,
              bypassSegment: bypassCodes,
              blockedTrack: `${startNode} → ${nextNode}`,
              distanceKm: dijkstraResult.totalDistanceKm,
              delayMinutes: delayAdded,
              reallocated: true,
            });
          }
        }
      }
    }

    return {
      data: rows[0],
      damagedTrack,
      affectedCount: reroutedJourneys.length,
      reroutedJourneys,
      graphVersion: graphVersion(),
    };
      });
      res.status(201).json(result);
    } finally { client.release(); }
  });

  router.post('/conflicts/:id/resolve', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = resolveConflictSchema.parse(req.body || {});
    const client = await pool.connect();
    try {
      const result = await transaction(client, async () => {
        await client.query("select pg_advisory_xact_lock(hashtext('railway:disruption-write'))");
    const {
      rows: [conflict],
    } = await client.query(`select * from public.disruptions where id=$1`, [id]);
    if (!conflict) throw Object.assign(new Error('Conflict not found'), { status: 404 });
    if (['RESOLVED', 'CANCELLED'].includes(conflict.status))
      throw Object.assign(new Error('Conflict is already closed'), { status: 409 });

    if (conflict.track_id) {
      const {
        rows: [t],
      } = await client.query(`select * from public.tracks where id=$1`, [conflict.track_id]);
      if (t) {
        await Promise.all(
          REGION_SCHEMAS.map((schema) =>
            client.query(
              `update ${schema}.tracks set status=$1, updated_at=now()
               where (from_station_id = $2 and to_station_id = $3)
                  or (from_station_id = $3 and to_station_id = $2)`,
              [body.restoreStatus, t.from_station_id, t.to_station_id],
            ),
          ),
        );
      } else {
        await Promise.all(
          REGION_SCHEMAS.map((schema) =>
            client.query(`update ${schema}.tracks set status=$1, updated_at=now() where id=$2`, [
              body.restoreStatus,
              conflict.track_id,
            ]),
          ),
        );
      }
    }
    if (conflict.station_id) {
      await client.query(`update public.stations set status='ACTIVE', updated_at=now() where id=$1`, [
        conflict.station_id,
      ]);
    }

    // Restore any rerouted train journeys associated with this conflict back to their original route
    const { rows: recs } = await client.query(
      `select rr.id as rec_id, rr.train_journey_id, rr.original_route, rr.estimated_delay_minutes,
              t.train_number, t.name as train_name,
              cs.station_code as current_code
       from public.route_recommendations rr
       join public.train_journeys tj on tj.id = rr.train_journey_id
       join public.trains t on t.id = tj.train_id
       left join public.stations cs on cs.id = tj.current_station_id
       where rr.disruption_id = $1 and rr.status = 'APPLIED'`,
      [id],
    );

    const restoredTrains = [];
    for (const r of recs) {
      const origRoute = Array.isArray(r.original_route)
        ? r.original_route
        : JSON.parse(r.original_route || '[]');

      let origCurrentCode = null;
      let origNextCode = null;
      if (r.current_code && origRoute.includes(r.current_code)) {
        origCurrentCode = r.current_code;
        const cIdx = origRoute.indexOf(r.current_code);
        origNextCode = cIdx < origRoute.length - 1 ? origRoute[cIdx + 1] : origRoute[cIdx];
      } else if (origRoute.length > 1) {
        origCurrentCode = origRoute[0];
        origNextCode = origRoute[1];
      } else if (origRoute.length > 0) {
        origCurrentCode = origRoute[0];
        origNextCode = origRoute[0];
      }

      await client.query(
        `update public.train_journeys
         set active_route = $1::jsonb,
             current_station_id = coalesce((select id from public.stations where station_code = $2), current_station_id),
             next_station_id = coalesce((select id from public.stations where station_code = $3), next_station_id),
             journey_status = 'RUNNING',
             delay_minutes = greatest(0, coalesce(delay_minutes, 0) - $4),
             updated_at = now()
         where id = $5`,
        [JSON.stringify(origRoute), origCurrentCode, origNextCode, r.estimated_delay_minutes || 0, r.train_journey_id],
      );

      await client.query(
        `update public.route_recommendations
         set status = 'EXPIRED', updated_at = now()
         where id = $1`,
        [r.rec_id],
      );

      await client.query(
        `update public.affected_trains
         set status = 'CLEARED'
         where disruption_id = $1 and train_journey_id = $2`,
        [id, r.train_journey_id],
      );

      restoredTrains.push({
        trainNumber: r.train_number,
        trainName: r.train_name,
        restoredRoute: origRoute,
      });
    }

    // Mark any remaining affected train rows as CLEARED
    await client.query(
      `update public.affected_trains
       set status = 'CLEARED'
       where disruption_id = $1`,
      [id],
    );

    const { rows } = await client.query(
      `update public.disruptions
       set status='RESOLVED', ended_at=now(), updated_at=now(), description = description || $2
       where id=$1 returning *`,
      [id, `\n\nResolution: ${body.resolutionNote}`],
    );

    return {
      data: rows[0],
      restoredTrainsCount: restoredTrains.length,
      restoredTrains,
      graphVersion: graphVersion(),
    };
      });
      res.json(result);
    } finally { client.release(); }
  });

  return router;
}
