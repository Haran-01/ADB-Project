import { connect } from './lib/database.mjs';

const checks = [
  ['regions', 1],
  ['stations', 25],
  ['tracks', 60],
  ['trains', 12],
  ['train_schedules', 80],
  ['train_journeys', 12],
  ['disruptions', 3],
  ['affected_trains', 4],
  ['route_recommendations', 2],
  ['event_log', 3],
  ['track_status_history', 60],
  ['train_status_history', 12],
  ['journey_delay_history', 5],
  ['disruption_history', 3],
];

async function run() {
  const client = await connect();
  try {
    for (const [table, expected] of checks) {
      const result = await client.query(`select count(*)::int as count from railway_main.${table}`);
      const actual = result.rows[0].count;
      const valid = table === 'event_log' ? actual >= expected : actual === expected;
      const status = valid ? 'OK' : 'CHECK';
      console.log(`${table}: ${actual} expected=${expected} ${status}`);
      if (!valid) process.exitCode = 1;
    }

    const fkViolations = await client.query(`
      select
        (select count(*) from railway_main.tracks tr left join railway_main.stations fs on fs.id = tr.from_station_id where fs.id is null) +
        (select count(*) from railway_main.tracks tr left join railway_main.stations ts on ts.id = tr.to_station_id where ts.id is null) +
        (select count(*) from railway_main.train_schedules sch left join railway_main.trains t on t.id = sch.train_id where t.id is null) +
        (select count(*) from railway_main.train_journeys tj left join railway_main.trains t on t.id = tj.train_id where t.id is null) +
        (select count(*) from railway_main.affected_trains at left join railway_main.disruptions d on d.id = at.disruption_id where d.id is null)
        as count
    `);

    const geo = await client.query(`
      select
        count(*) filter (where geom is not null)::int as station_geoms
      from railway_main.stations
    `);

    const trackGeo = await client.query(`
      select count(*) filter (where geom is not null)::int as track_geoms
      from railway_main.tracks
    `);

    if (
      Number(fkViolations.rows[0].count) !== 0 ||
      geo.rows[0].station_geoms !== 25 ||
      trackGeo.rows[0].track_geoms !== 60
    )
      process.exitCode = 1;
    console.log(`foreign key spot-check violations: ${fkViolations.rows[0].count}`);
    console.log(`station geometries: ${geo.rows[0].station_geoms}`);
    console.log(`track geometries: ${trackGeo.rows[0].track_geoms}`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
