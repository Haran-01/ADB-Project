import { readFileSync } from 'node:fs';
import { connect, projectRoot, transaction } from './lib/database.mjs';

export async function applyDistributedDemo(client) {
  const sql = readFileSync(`${projectRoot}/database/scenarios/001_cross_region_demo.sql`, 'utf8');
  return transaction(client, async () => {
    await client.query(sql);
    const {
      rows: [summary],
    } = await client.query(`select count(*)::int journeys,
      coalesce(sum(region_count),0)::int region_memberships from railway_main.v_cross_region_journeys`);
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
