const REGION_SCHEMAS = ['railway_south', 'railway_central', 'railway_north'];
const TARGET_TRAIN_COUNT = 92;

const ROUTE_TEMPLATES = [
  ['MAS', 'AJJ', 'KPD', 'JTJ', 'SA', 'ED', 'KRR', 'TPJ', 'DG', 'MDU', 'VPT', 'TEN', 'NCJ'],
  ['NCJ', 'TEN', 'VPT', 'MDU', 'DG', 'TPJ', 'KRR', 'ED', 'SA', 'JTJ', 'KPD', 'AJJ', 'MAS'],
  ['MAS', 'AJJ', 'KPD', 'JTJ', 'SA', 'ED', 'TUP', 'CBE'],
  ['CBE', 'TUP', 'ED', 'SA', 'JTJ', 'KPD', 'AJJ', 'MAS'],
  ['MS', 'TBM', 'CGL', 'VM', 'TPJ'],
  ['TPJ', 'VM', 'CGL', 'TBM', 'MS'],
  ['TPJ', 'TJ', 'MV', 'VM', 'CGL', 'TBM', 'MS'],
  ['MS', 'TBM', 'CGL', 'VM', 'MV', 'TJ', 'TPJ'],
  ['MAS', 'AJJ', 'RU', 'TPTY'],
  ['TPTY', 'RU', 'AJJ', 'MAS'],
  ['VM', 'PDY'],
  ['PDY', 'VM'],
  ['SBC', 'JTJ', 'KPD', 'AJJ', 'MAS'],
  ['MAS', 'AJJ', 'KPD', 'JTJ', 'SBC'],
  ['CSMT', 'DR', 'KYN', 'BSL', 'ET', 'BPL', 'BINA'],
  ['BINA', 'BPL', 'ET', 'BSL', 'KYN', 'DR', 'CSMT'],
  ['CSMT', 'NGP', 'ET', 'BPL', 'BINA'],
  ['NGP', 'BSL', 'KYN', 'DR', 'CSMT'],
  ['NDLS', 'NZM', 'MTJ', 'AGC', 'GWL', 'VGLJ'],
  ['VGLJ', 'GWL', 'AGC', 'MTJ', 'NZM', 'NDLS'],
  ['NDLS', 'CNB', 'LKO'],
  ['LKO', 'CNB', 'NDLS'],
  ['NDLS', 'CNB', 'PRYJ'],
  ['PRYJ', 'CNB', 'NDLS'],
  ['MAS', 'AJJ', 'RU', 'NGP', 'ET', 'BPL', 'BINA', 'VGLJ', 'GWL', 'AGC', 'MTJ', 'NDLS'],
  ['NDLS', 'MTJ', 'AGC', 'GWL', 'VGLJ', 'BINA', 'BPL', 'ET', 'NGP', 'RU', 'AJJ', 'MAS'],
  ['CSMT', 'DR', 'KYN', 'BSL', 'ET', 'BPL', 'BINA', 'VGLJ', 'GWL', 'AGC', 'MTJ', 'NDLS'],
  ['NDLS', 'MTJ', 'AGC', 'GWL', 'VGLJ', 'BINA', 'BPL', 'ET', 'BSL', 'KYN', 'DR', 'CSMT'],
  ['NCJ', 'TEN', 'VPT', 'MDU', 'DG', 'TPJ', 'VM', 'CGL', 'TBM', 'MS', 'MAS', 'AJJ', 'RU', 'NGP', 'ET'],
  ['ET', 'NGP', 'RU', 'AJJ', 'MAS', 'MS', 'TBM', 'CGL', 'VM', 'TPJ', 'DG', 'MDU', 'VPT', 'TEN', 'NCJ'],
];

function syntheticUuid(index) {
  return `70000000-0000-0000-0003-${String(index + 1).padStart(12, '0')}`;
}

function minutesToTime(totalMinutes) {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

async function visibleTrainCount(pool) {
  const unions = {
    trains: REGION_SCHEMAS.map((schema) => `select id from ${schema}.trains`).join(' union all '),
    schedules: REGION_SCHEMAS.map((schema) => `select train_id from ${schema}.train_schedules`).join(' union all '),
  };
  const { rows } = await pool.query(`
    with all_trains as (${unions.trains}),
         all_schedules as (${unions.schedules})
    select count(*)::int as count
    from all_trains t
    where exists (select 1 from all_schedules s where s.train_id = t.id)
  `);
  return Number(rows[0]?.count ?? 0);
}

async function loadStationMap(pool) {
  const stationUnion = REGION_SCHEMAS.map(
    (schema) => `select '${schema}' as source_schema, id, station_code, name from ${schema}.stations`,
  ).join(' union all ');
  const { rows } = await pool.query(stationUnion);
  return new Map(rows.map((row) => [row.station_code, row]));
}

async function clearSyntheticTrains(pool) {
  for (const schema of REGION_SCHEMAS) {
    await pool.query(`delete from ${schema}.train_schedules where train_id::text like '70000000-%'`);
    await pool.query(`delete from ${schema}.train_journeys where train_id::text like '70000000-%'`);
    await pool.query(`delete from ${schema}.trains where id::text like '70000000-%'`);
  }
}

function buildRoute(index, stationMap) {
  for (let offset = 0; offset < ROUTE_TEMPLATES.length; offset++) {
    const route = ROUTE_TEMPLATES[(index + offset) % ROUTE_TEMPLATES.length];
    if (route.every((code) => stationMap.has(code))) return route;
  }
  return [];
}

export async function expandTrainData(pool, { targetCount = TARGET_TRAIN_COUNT } = {}) {
  await pool.query('begin');
  try {
    await clearSyntheticTrains(pool);
    const stationMap = await loadStationMap(pool);
    const existingCount = await visibleTrainCount(pool);
    const required = Math.max(0, targetCount - existingCount);

    for (let index = 0; index < required; index++) {
      const route = buildRoute(index, stationMap);
      if (route.length < 2) continue;

      const id = syntheticUuid(index);
      const trainNumber = String(70001 + index);
      const source = stationMap.get(route[0]);
      const destination = stationMap.get(route[route.length - 1]);
      const trainType = index % 5 === 0 ? 'SUPERFAST' : index % 3 === 0 ? 'INTERCITY' : 'EXPRESS';
      const priority = trainType === 'SUPERFAST' ? 1 : trainType === 'INTERCITY' ? 2 : 3;
      const serviceLabel =
        trainType === 'SUPERFAST' ? 'Superfast Express' : trainType === 'INTERCITY' ? 'Intercity Express' : 'Express';
      const name = `${route[0]} ${route[route.length - 1]} ${serviceLabel} ${String(index + 1).padStart(2, '0')}`;

      await pool.query(
        `insert into ${source.source_schema}.trains
           (id, train_number, name, train_type, priority, source_station_id, destination_station_id, status)
         values ($1, $2, $3, $4::public.train_type, $5, $6, $7, 'RUNNING'::public.train_status)
         on conflict (train_number) do update
         set name = excluded.name,
             train_type = excluded.train_type,
             priority = excluded.priority,
             source_station_id = excluded.source_station_id,
             destination_station_id = excluded.destination_station_id,
             status = excluded.status`,
        [id, trainNumber, name, trainType, priority, source.id, destination.id],
      );

      const startMinutes = 300 + ((index * 17) % 960);
      let elapsedMinutes = 0;
      for (let stopIndex = 0; stopIndex < route.length; stopIndex++) {
        const station = stationMap.get(route[stopIndex]);
        const isFirst = stopIndex === 0;
        const isLast = stopIndex === route.length - 1;
        const arrivalMinutes = startMinutes + elapsedMinutes;
        const departureMinutes = arrivalMinutes + (isFirst ? 0 : 4 + ((index + stopIndex) % 5));
        const departureForNext = isLast ? arrivalMinutes : departureMinutes;
        const platform = String(((index + stopIndex) % 8) + 1);

        await pool.query(
          `insert into ${station.source_schema}.train_schedules
             (train_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, day_offset, platform)
           values ($1, $2, $3, $4::time, $5::time, $6, $7)
           on conflict (train_id, stop_sequence) do update
           set station_id = excluded.station_id,
               scheduled_arrival = excluded.scheduled_arrival,
               scheduled_departure = excluded.scheduled_departure,
               day_offset = excluded.day_offset,
               platform = excluded.platform`,
          [
            id,
            station.id,
            stopIndex + 1,
            isFirst ? null : minutesToTime(arrivalMinutes),
            isLast ? null : minutesToTime(departureMinutes),
            Math.floor(arrivalMinutes / 1440),
            platform,
          ],
        );

        elapsedMinutes = departureForNext - startMinutes + 42 + ((index + stopIndex) % 5) * 9;
      }
    }

    await pool.query('commit');
  } catch (error) {
    await pool.query('rollback').catch(() => {});
    throw error;
  }
}
