export async function runOperationalReset(pool, now = new Date()) {
  const serviceDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.RAILWAY_TIMEZONE || 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  for (const schema of ['railway_south', 'railway_central', 'railway_north']) {
    await pool.query(`
      insert into ${schema}.train_journeys
        (train_id, journey_date, current_station_id, next_station_id, delay_minutes, journey_status)
      select t.id, $1::date, first_stop.station_id, next_stop.station_id, 0, 'SCHEDULED'
      from ${schema}.trains t
      cross join lateral (
        select station_id, stop_sequence from public.train_schedules where train_id=t.id
        order by stop_sequence limit 1
      ) first_stop
      left join lateral (
        select station_id from public.train_schedules
        where train_id=t.id and stop_sequence>first_stop.stop_sequence
        order by stop_sequence limit 1
      ) next_stop on true
      on conflict (train_id,journey_date) do nothing`, [serviceDate]);
  }
}

export function scheduleOperationalReset(pool) {
  let pending = null;
  const check = () => {
    if (pending) return;
    pending = runOperationalReset(pool)
      .catch((error) => console.error('[Operational Reset] Check failed:', error.code ?? error.name))
      .finally(() => { pending = null; });
  };
  check();
  // Check the railway service date independently of the host's local timezone.
  const timer = setInterval(check, 60000).unref();
  return async () => { clearInterval(timer); await pending; };
}
