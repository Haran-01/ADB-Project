import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { createApp } from '../backend/src/app.js';
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

async function createInMemoryDatabase() {
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
  return db;
}

async function main() {
  console.log('Initializing in-memory PostgreSQL + PostGIS database with PGlite...');
  const client = await createInMemoryDatabase();
  console.log('Database initialized successfully with schema, PostGIS, seeds, triggers, and views!');

  // In-memory graph router matching Neo4j behavior for local standalone mode
  const graph = {
    health: async () => true,
    sync: async () => {},
    routes: async (from, to, excludeTracks = []) => {
      const res = await client.query(
        `with recursive paths(path, last_station, total_dist) as (
          select array[s.station_code]::text[], s.station_code, 0.0
          from public.stations s where s.station_code = $1
          union all
          select p.path || s2.station_code, s2.station_code, p.total_dist + t.distance_km
          from paths p
          join public.stations s1 on s1.station_code = p.last_station
          join public.tracks t on t.from_station_id = s1.id and t.status = 'ACTIVE'
          join public.stations s2 on s2.id = t.to_station_id
          where not (s2.station_code = any(p.path))
            and array_length(p.path, 1) < 12
            and not (t.id = any($3::uuid[]))
        )
        select path as "stationCodes", total_dist as "distanceKm", ceil(total_dist / 80 * 60) as "travelMinutes"
        from paths where last_station = $2
        order by total_dist limit 3`,
        [from, to, excludeTracks],
      );
      return res.rows || [];
    },
  };

  const analysis = new AnalysisService(client, graph);
  const env = {
    PORT: process.env.PORT || 4003,
    HOST: '127.0.0.1',
    NODE_ENV: 'development',
    FRONTEND_ORIGIN: '*',
    WORKER_ENABLED: process.env.WORKER_ENABLED ?? 'false',
    WORKER_POLL_MS: 1000,
  };

  const app = createApp({ pool: client, graph, analysis, env });
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  const worker = new EventWorker({ pool: client, analysis, io, env });

  server.listen(env.PORT, env.HOST, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Intelligent Railway API running on http://${env.HOST}:${env.PORT}`);
    console.log(`⚡ Standalone mode with PGlite (PostgreSQL + PostGIS + Active Triggers)`);
    console.log(`=======================================================`);
    if (env.WORKER_ENABLED === 'true') worker.start();
  });

  process.on('SIGINT', async () => {
    await worker.stop();
    await new Promise((r) => io.close(r));
    await client.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start standalone server:', err);
  process.exit(1);
});
