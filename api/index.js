import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { createApp } from '../backend/src/app.js';
import { AnalysisService } from '../backend/src/modules/analysis/service.js';

const projectRoot = process.cwd();

let appInstance = null;

async function getApp() {
  if (appInstance) return appInstance;

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
    const full = path.join(projectRoot, dir);
    if (!existsSync(full)) continue;
    const files = readdirSync(full).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = readFileSync(path.join(full, file), 'utf8');
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

  const graph = {
    health: async () => true,
    sync: async () => {},
    routes: async (from, to, excludeTracks = []) => {
      const res = await db.query(
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

  const analysis = new AnalysisService(db, graph);
  const env = {
    PORT: process.env.PORT || 4003,
    HOST: '0.0.0.0',
    NODE_ENV: 'production',
    FRONTEND_ORIGIN: '*',
    WORKER_ENABLED: 'false',
    WORKER_POLL_MS: 1000,
  };

  appInstance = createApp({ pool: db, graph, analysis, env });
  return appInstance;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
