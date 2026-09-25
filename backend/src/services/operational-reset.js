import { getEnv } from '../config/env.js';

export async function runOperationalReset(pool) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  console.log(`[Operational Reset] Running daily operational reset check for ${todayStr}...`);

  const schemas = ['railway_south', 'railway_central', 'railway_north'];

  for (const schema of schemas) {
    // Fetch all active trains in schema
    const { rows: trains } = await pool.query(
      `SELECT t.id, t.train_number, t.name, t.source_station_id, t.destination_station_id 
       FROM ${schema}.trains t`
    );

    for (const train of trains) {
      // Check if journey already initialized for today
      const { rows: existing } = await pool.query(
        `SELECT id FROM ${schema}.train_journeys WHERE train_id = $1 AND journey_date = $2::date`,
        [train.id, todayStr]
      );

      if (existing.length > 0) continue;

      // Get first stop (source) and second stop (next) from schedule
      const { rows: stops } = await pool.query(
        `SELECT sch.stop_sequence, s.id as station_id 
         FROM ${schema}.train_schedules sch 
         JOIN ${schema}.stations s ON s.id = sch.station_id 
         WHERE sch.train_id = $1 
         ORDER BY sch.stop_sequence ASC`,
        [train.id]
      );

      if (stops.length === 0) continue;

      const currentStationId = stops[0].station_id;
      const nextStationId = stops.length > 1 ? stops[1].station_id : null;

      await pool.query(
        `INSERT INTO ${schema}.train_journeys (
          id, train_id, journey_date, current_station_id, next_station_id,
          actual_arrival, actual_departure, delay_minutes, journey_status, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2::date, $3, $4,
          NULL, NULL, 0, 'SCHEDULED', NOW(), NOW()
        ) ON CONFLICT (train_id, journey_date) DO NOTHING`,
        [train.id, todayStr, currentStationId, nextStationId]
      );
    }
  }

  console.log(`[Operational Reset] Service day ${todayStr} initialized successfully.`);
}

export function scheduleOperationalReset(pool) {
  // Perform immediate startup check
  runOperationalReset(pool).catch((err) => console.error('[Operational Reset] Startup check error:', err));

  // Calculate milliseconds until next 12:00 AM midnight
  function getMsUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }

  function planNextReset() {
    const ms = getMsUntilMidnight();
    setTimeout(async () => {
      try {
        await runOperationalReset(pool);
      } catch (err) {
        console.error('[Operational Reset] Midnight job error:', err);
      }
      planNextReset(); // Schedule next day's midnight reset
    }, ms);
  }

  planNextReset();
}
