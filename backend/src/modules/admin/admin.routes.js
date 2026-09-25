import { Router } from 'express';
import { z } from 'zod';

const ADMIN_TOKEN = 'admin-session-token-12345';
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
    description: z.string().trim().min(1).max(2000),
    expectedDuration: z.string().trim().max(80).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.trackId) !== Boolean(v.stationId), {
    message: 'Exactly one trackId or stationId is required',
  });
const resolveConflictSchema = z
  .object({
    resolutionNote: z.string().trim().min(1).max(2000),
    restoreStatus: z.enum(['ACTIVE', 'FAILED', 'MAINTENANCE', 'BLOCKED']).default('ACTIVE'),
  })
  .strict();

function requireAdmin(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Administrator authorization required' });
  next();
}

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
    adjacency.get(edge.targetCode)?.push({
      ...edge,
      source: edge.target,
      target: edge.source,
      sourceCode: edge.targetCode,
      targetCode: edge.sourceCode,
      reversed: true,
    });
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
        .catch(() => ({ schema, stations: 0, tracks: 0, active_trains: 0, open_conflicts: 0 })),
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
    if (sourceKey && grouped.has(sourceKey)) grouped.get(sourceKey).tracks += 1;
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

export function adminRoutes(pool) {
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
      `select d.*, fs.station_code as from_station, ts.station_code as to_station, s.station_code as station_code
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

  router.post('/conflicts', async (req, res) => {
    const body = conflictSchema.parse(req.body);
    const description = [
      body.title,
      body.description,
      body.expectedDuration ? `Expected duration: ${body.expectedDuration}` : null,
      body.note ? `Note: ${body.note}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');
    const { rows } = await pool.query(
      `insert into public.disruptions (type, track_id, station_id, severity, reported_by, description, status)
       values ($1,$2,$3,$4,$5,$6,'OPEN')
       returning *`,
      [body.conflictType, body.trackId ?? null, body.stationId ?? null, body.severity, 'admin', description],
    );
    if (body.trackId) {
      await pool.query(`update public.tracks set status='BLOCKED', updated_at=now() where id=$1`, [
        body.trackId,
      ]);
    }
    if (body.stationId && body.conflictType === 'STATION_CLOSURE') {
      await pool.query(`update public.stations set status='CLOSED', updated_at=now() where id=$1`, [
        body.stationId,
      ]);
    }
    res.status(201).json({ data: rows[0], graphVersion: graphVersion() });
  });

  router.post('/conflicts/:id/resolve', async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = resolveConflictSchema.parse(req.body);
    const {
      rows: [conflict],
    } = await pool.query(`select * from public.disruptions where id=$1`, [id]);
    if (!conflict) return res.status(404).json({ error: 'Conflict not found' });
    if (conflict.track_id) {
      await pool.query(`update public.tracks set status=$1, updated_at=now() where id=$2`, [
        body.restoreStatus,
        conflict.track_id,
      ]);
    }
    if (conflict.station_id) {
      await pool.query(`update public.stations set status='ACTIVE', updated_at=now() where id=$1`, [
        conflict.station_id,
      ]);
    }
    const { rows } = await pool.query(
      `update public.disruptions
       set status='RESOLVED', ended_at=now(), updated_at=now(), description = description || $2
       where id=$1 returning *`,
      [id, `\n\nResolution: ${body.resolutionNote}`],
    );
    res.json({ data: rows[0], graphVersion: graphVersion() });
  });

  return router;
}
