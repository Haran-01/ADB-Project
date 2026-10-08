import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { createPglitePool } from './lib/pglite-pool.mjs';
import { createApp, authorized } from '../backend/src/app.js';
import { AnalysisService } from '../backend/src/modules/analysis/service.js';
import { EventWorker } from '../backend/src/workers/events.js';
import { projectRoot } from './lib/database.mjs';

function getSqlFiles(dir) {
  const full = path.join(projectRoot, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(full, f), 'utf8'));
}

export async function createInMemoryDatabase() {
  const db = new PGlite({ extensions: { postgis } });
  const sqlDirs = [
    'database/migrations',
    'database/views',
    'database/functions',
    'database/procedures',
    'database/triggers',
    'database/seeds',
    'database/seeds/extra_nodes',
  ];
  for (const dir of sqlDirs) {
    for (const sql of getSqlFiles(dir)) {
      if (sql.trim().startsWith('\\')) continue;
      const cleanSql = sql.replace(/create extension if not exists pgcrypto[^;]*;/gi, '-- skipped pgcrypto');
      await db.exec(cleanSql);
      if (dir === 'database/migrations') {
        await db.exec(`set search_path = public, extensions, railway_south, railway_central, railway_north;`).catch(() => {});
        await db.exec(`create or replace function extensions.gen_random_uuid() returns uuid as $$ select gen_random_uuid(); $$ language sql;`).catch(() => {});
      }
    }
  }
  const expanderPath = path.join(projectRoot, 'scripts/expand-train-data.mjs');
  if (existsSync(expanderPath)) {
    const { expandTrainData } = await import(pathToFileURL(expanderPath).href);
    await expandTrainData(db);
  }
  return createPglitePool(db);
}

export function createLocalGraph(client) {
  // In-memory graph router matching Neo4j behavior for local standalone mode
  return {
    health: async () => true,
    sync: async () => {},
    routes: async (from, to, excludeTracks = [], queryClient = client) => {
      if (from === to) return [];
      const res = await queryClient.query(
        `with recursive paths(path, last_station, total_dist, travel_minutes, track_ids) as (
          select array[s.station_code]::text[], s.station_code, 0.0, 0.0, array[]::uuid[]
          from public.stations s where s.station_code = $1 and s.status='ACTIVE'
            and not exists(select 1 from public.disruptions d where d.station_id=s.id and d.status in ('OPEN','ANALYZING') and d.started_at<=now() and (d.ended_at is null or d.ended_at>now()))
          union all
          select p.path || s2.station_code, s2.station_code, p.total_dist + t.distance_km, p.travel_minutes + ceil(t.distance_km/t.speed_limit_kmph*60), p.track_ids || t.id
          from paths p
          join public.stations s1 on s1.station_code = p.last_station
          join public.tracks t on t.from_station_id = s1.id and t.status = 'ACTIVE'
          join public.stations s2 on s2.id = t.to_station_id and s2.status='ACTIVE'
          cross join lateral public.fn_get_active_track_availability(t.id) availability
          where availability.is_available and not (s2.station_code = any(p.path))
            and p.last_station <> $2
            and not exists(select 1 from public.disruptions d where d.station_id=s2.id and d.status in ('OPEN','ANALYZING') and d.started_at<=now() and (d.ended_at is null or d.ended_at>now()))
            and array_length(p.path, 1) < 13
            and not (t.id = any($3::uuid[]))
        )
        select path as "stationCodes", total_dist as "distanceKm", travel_minutes as "travelMinutes", track_ids as "trackIds"
        from paths where last_station = $2
        order by travel_minutes, path limit 3`,
        [from, to, excludeTracks],
      );
      return res.rows || [];
    },
  };

}

async function main() {
  console.log('Initializing in-memory PostgreSQL + PostGIS database with PGlite...');
  const client = await createInMemoryDatabase();
  console.log('Database initialized successfully with schema, PostGIS, seeds, triggers, and views!');

  const graph = createLocalGraph(client);
  const analysis = new AnalysisService(client, graph);
  const env = {
    PORT: process.env.PORT || 4003,
    HOST: process.env.HOST || '127.0.0.1',
    NODE_ENV: process.env.NODE_ENV || 'development',
    FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    API_TOKEN: process.env.API_TOKEN,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    WORKER_ENABLED: process.env.WORKER_ENABLED ?? 'true',
    WORKER_POLL_MS: 1000,
  };

  if ((env.NODE_ENV === 'production' || env.HOST !== '127.0.0.1') && (!env.API_TOKEN || env.API_TOKEN.length < 24 || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12))
    throw new Error('Public/production standalone mode requires API_TOKEN (24+ chars) and ADMIN_PASSWORD (12+ chars)');

  const app = createApp({ pool: client, graph, analysis, env });
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: env.FRONTEND_ORIGIN } });

  io.use((socket, next) => authorized(socket.handshake.auth?.token, env.API_TOKEN) ? next() : next(new Error('Unauthorized')));
  const worker = new EventWorker({ pool: client, analysis, io, env });

  server.listen(env.PORT, env.HOST, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Intelligent Railway API running on http://${env.HOST}:${env.PORT}`);
    console.log(`⚡ Standalone mode with PGlite (PostgreSQL + PostGIS + Active Triggers)`);
    console.log(`=======================================================`);
    if (env.WORKER_ENABLED === 'true') worker.start();
  });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await worker.stop();
    await new Promise((r) => io.close(r));
    await client.close();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((err) => {
  console.error('Failed to start standalone server:', err);
  process.exit(1);
});
