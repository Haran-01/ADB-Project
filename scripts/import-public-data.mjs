import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { connect, transaction } from './lib/database.mjs';

const stationSchema = z
  .object({
    sourceId: z.string().min(1),
    code: z.string().min(1).max(10),
    name: z.string().min(1),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    state: z.string().optional(),
  })
  .strict();
const routeSchema = z
  .object({
    sourceId: z.string().min(1),
    trainNumber: z.string().min(1),
    name: z.string().min(1),
    trainType: z.enum(['EXPRESS', 'PASSENGER', 'SUPERFAST', 'INTERCITY', 'FREIGHT']).default('PASSENGER'),
    priority: z.number().int().positive().default(5),
    speedLimitKmph: z.number().int().positive().default(90),
    stops: z.array(z.string()).min(2),
  })
  .strict();
const datasetSchema = z
  .object({
    sourceName: z.string().min(1),
    sourceUrl: z.url(),
    sourceLicense: z.string().min(1),
    regionCode: z.string().min(1).max(10),
    stations: z.array(z.unknown()),
    routes: z.array(z.unknown()).default([]),
  })
  .strict();
export const normalizeCode = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);

export async function importPublicDataset(client, raw) {
  const dataset = datasetSchema.parse(raw);
  const checksum = createHash('sha256').update(JSON.stringify(raw)).digest('hex');
  return transaction(client, async () => {
    const previous = await client.query(
      "select * from railway_main.import_batches where source_checksum=$1 and status='COMPLETED'",
      [checksum],
    );
    if (previous.rows[0]) return { ...previous.rows[0], reused: true };
    const {
      rows: [batch],
    } = await client.query(
      `insert into railway_main.import_batches(source_name,source_url,source_license,source_checksum,status)
      values($1,$2,$3,$4,'RUNNING') returning *`,
      [dataset.sourceName, dataset.sourceUrl, dataset.sourceLicense, checksum],
    );
    const region = await client.query('select id from railway_main.regions where code=$1', [
      normalizeCode(dataset.regionCode),
    ]);
    if (!region.rows[0])
      throw new Error(`Unknown region ${dataset.regionCode}; create the region before importing`);
    let stationsImported = 0,
      tracksImported = 0,
      trainsImported = 0;
    for (const rawStation of dataset.stations) {
      const parsed = stationSchema.safeParse(rawStation);
      if (!parsed.success) {
        await reject(
          client,
          batch.id,
          'station',
          rawStation?.sourceId,
          parsed.error.issues[0].message,
          rawStation,
        );
        continue;
      }
      const s = parsed.data;
      const code = normalizeCode(s.code);
      if (!code) {
        await reject(
          client,
          batch.id,
          'station',
          s.sourceId,
          'Station code is empty after normalization',
          rawStation,
        );
        continue;
      }
      const imported = await client.query(
        `insert into railway_main.stations(station_code,name,region_id,state,latitude,longitude,geom,data_source,source_record_id)
        values($1,$2,$3,$4,$5::numeric,$6::numeric,extensions.ST_SetSRID(extensions.ST_MakePoint($6::double precision,$5::double precision),4326)::extensions.geography,$7,$8)
        on conflict(station_code) do update set name=excluded.name,state=coalesce(excluded.state,railway_main.stations.state),
          latitude=excluded.latitude,longitude=excluded.longitude,geom=excluded.geom,data_source=excluded.data_source,
          source_record_id=excluded.source_record_id
        where railway_main.stations.data_source=excluded.data_source
        returning id`,
        [
          code,
          s.name,
          region.rows[0].id,
          s.state ?? null,
          s.latitude,
          s.longitude,
          dataset.sourceName,
          s.sourceId,
        ],
      );
      stationsImported += imported.rowCount;
    }
    for (const rawRoute of dataset.routes) {
      const parsed = routeSchema.safeParse(rawRoute);
      if (!parsed.success) {
        await reject(client, batch.id, 'route', rawRoute?.sourceId, parsed.error.issues[0].message, rawRoute);
        continue;
      }
      const route = parsed.data;
      const codes = route.stops.map(normalizeCode);
      const found = await client.query(
        'select id,station_code from railway_main.stations where station_code=any($1)',
        [codes],
      );
      if (found.rows.length !== new Set(codes).size) {
        await reject(
          client,
          batch.id,
          'route',
          route.sourceId,
          'Route references unknown station codes',
          rawRoute,
        );
        continue;
      }
      const stationIds = new Map(found.rows.map((s) => [s.station_code, s.id]));
      for (let i = 0; i < codes.length - 1; i++)
        for (const [from, to] of [
          [codes[i], codes[i + 1]],
          [codes[i + 1], codes[i]],
        ]) {
          const sourceId = `${route.sourceId}:${from}:${to}`;
          await client.query(
            `insert into railway_main.tracks(from_station_id,to_station_id,region_id,distance_km,track_type,speed_limit_kmph,geom,valid_from,data_source,source_record_id)
          select a.id,b.id,$3,greatest(1,round((extensions.ST_Distance(a.geom,b.geom)/1000*1.1)::numeric,2)),
            'IMPORTED_ROUTE_PROJECTION',$4,extensions.ST_MakeLine(a.geom::extensions.geometry,b.geom::extensions.geometry)::extensions.geography,
            now(),$5,$6 from railway_main.stations a,railway_main.stations b where a.id=$1 and b.id=$2
          on conflict(from_station_id,to_station_id) do nothing`,
            [
              stationIds.get(from),
              stationIds.get(to),
              region.rows[0].id,
              route.speedLimitKmph,
              dataset.sourceName,
              sourceId,
            ],
          );
          tracksImported++;
        }
      const trainNumber = normalizeCode(route.trainNumber);
      const {
        rows: [train],
      } = await client.query(
        `insert into railway_main.trains(train_number,name,train_type,priority,source_station_id,destination_station_id)
        values($1,$2,$3,$4,$5,$6) on conflict(train_number) do update set name=excluded.name returning id`,
        [
          trainNumber,
          route.name,
          route.trainType,
          route.priority,
          stationIds.get(codes[0]),
          stationIds.get(codes.at(-1)),
        ],
      );
      await client.query(
        'delete from railway_main.train_schedules where train_id=$1 and not exists(select 1 from railway_main.train_journeys where train_id=$1)',
        [train.id],
      );
      for (let i = 0; i < codes.length; i++)
        await client.query(
          `insert into railway_main.train_schedules(train_id,station_id,stop_sequence)
        values($1,$2,$3) on conflict(train_id,stop_sequence) do update set station_id=excluded.station_id`,
          [train.id, stationIds.get(codes[i]), i + 1],
        );
      trainsImported++;
    }
    const {
      rows: [done],
    } = await client.query(
      `update railway_main.import_batches set status='COMPLETED',completed_at=now(),
      stations_imported=$2,tracks_imported=$3,trains_imported=$4 where id=$1 returning *`,
      [batch.id, stationsImported, tracksImported, trainsImported],
    );
    return done;
  });
}
async function reject(client, batchId, type, sourceId, reason, payload) {
  await client.query(
    `insert into railway_main.import_rejections(batch_id,record_type,source_record_id,reason,payload)
  values($1,$2,$3,$4,$5::jsonb)`,
    [batchId, type, sourceId ?? null, reason, JSON.stringify(payload ?? null)],
  );
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[process.argv.indexOf('--file') + 1];
  if (!process.argv.includes('--apply') || !file)
    throw new Error('Usage: node scripts/import-public-data.mjs --file dataset.json --apply');
  const client = await connect();
  try {
    console.log(await importPublicDataset(client, JSON.parse(readFileSync(file, 'utf8'))));
  } finally {
    await client.end();
  }
}
