import { testDatabase } from '../tests/helpers/database.mjs';
import { DistributedQueryEngine } from '../backend/src/db/distributed.js';

async function main() {
  console.log('⚡ Initializing Distributed Railway Node Test Environment...');
  const { client } = await testDatabase();
  const engine = new DistributedQueryEngine(client);

  console.log('\n=======================================================');
  console.log('1. HORIZONTAL TABLE FRAGMENTATION VERIFICATION');
  console.log('=======================================================');
  
  for (const region of ['south', 'central', 'north']) {
    const stations = await engine.queryFragment(region, 'select count(*)::int as cnt from {schema}.stations');
    const tracks = await engine.queryFragment(region, 'select count(*)::int as cnt from {schema}.tracks');
    const trains = await engine.queryFragment(region, 'select count(*)::int as cnt from {schema}.trains');
    const schedules = await engine.queryFragment(region, 'select count(*)::int as cnt from {schema}.train_schedules');

    console.log(`📍 Regional Fragment Node [railway_${region}]:`);
    console.log(`   • stations : ${stations[0].cnt} rows`);
    console.log(`   • tracks   : ${tracks[0].cnt} rows`);
    console.log(`   • trains   : ${trains[0].cnt} rows`);
    console.log(`   • schedules: ${schedules[0].cnt} rows`);
  }

  console.log('\n=======================================================');
  console.log('2. DISTRIBUTED SCATTER-GATHER RETRIEVAL');
  console.log('=======================================================');
  const scatterTrains = await engine.scatterGather('trains', 'train_number', 5, 0);
  console.log(`Retrieved ${scatterTrains.length} trains concurrently from regional fragments:`);
  console.table(scatterTrains.map(t => ({
    source_fragment: t.source_fragment,
    train_number: t.train_number,
    name: t.name,
    train_type: t.train_type
  })));

  console.log('\n=======================================================');
  console.log('3. CROSS-FRAGMENT JOIN EXECUTION');
  console.log('=======================================================');
  const joinedTrains = await engine.crossFragmentJoinTrainSchedules();
  console.log(`Successfully performed Cross-Fragment JOIN across Regional Node Fragments!`);
  console.log(`Total Joined Trains: ${joinedTrains.length}`);

  if (joinedTrains.length > 0) {
    const sample = joinedTrains[0];
    console.log(`\nSample Cross-Fragment Joined Train:`);
    console.log(` • Train          : ${sample.train_number} - ${sample.name}`);
    console.log(` • Origin Fragment: railway_${sample.train_region_fragment}`);
    console.log(` • Schedule Stops : ${sample.schedule_count}`);
    console.log(` • Route Sequence :`);
    console.table(sample.schedules.slice(0, 5));
  }

  await client.end();
}

main().catch(console.error);
