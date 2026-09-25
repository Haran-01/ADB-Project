import { readFileSync } from 'node:fs';
import { connect, projectRoot, transaction } from './lib/database.mjs';

export async function applyDistributedDemo(client) {
  const sql = readFileSync(`${projectRoot}/database/scenarios/001_cross_region_demo.sql`, 'utf8');
  return transaction(client, async () => {
    await client.query(sql);
    const {
      rows: [summary],
    } = await client.query(`select count(*)::int journeys,
      coalesce(sum(region_count),0)::int region_memberships from (
        select tj.id, count(distinct s.region_id)::int region_count
        from public.train_journeys tj
        join public.trains t on t.id = tj.train_id
        join public.train_schedules ts on ts.train_id = t.id
        join public.stations s on s.id = ts.station_id
        group by tj.id
      ) sub`);
    if (summary.journeys < 1) throw new Error('Cross-region journey was not created');
    return summary;
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv.includes('--apply'))
    throw new Error('Use --apply to add/update the non-destructive cross-region demo.');
  const client = await connect();
  try {
    console.log(await applyDistributedDemo(client));
  } finally {
    await client.end();
  }
}
