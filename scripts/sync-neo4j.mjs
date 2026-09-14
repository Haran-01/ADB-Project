import { connect, loadEnv, transaction } from './lib/database.mjs';
import { createNeo4j } from '../backend/src/db/neo4j.js';
import { GraphProjection } from '../backend/src/modules/routing/graph.js';
const env = loadEnv();
const client = await connect(env);
const driver = createNeo4j(env);
try {
  const graph = new GraphProjection(driver, env.NEO4J_DATABASE);
  await graph.initialize();
  console.log(await transaction(client, () => graph.sync(client)));
  if (process.argv.includes('--verify')) {
    const routes = await graph.routes('CGL', 'TPJ');
    if (!routes.length) throw new Error('No alternate CGL to TPJ route found');
    for (const route of routes) {
      const { rows } = await client.query('select * from railway_main.fn_validate_route($1::jsonb)', [
        JSON.stringify(route.stationCodes),
      ]);
      if (!rows[0].is_valid) throw new Error('Graph candidate failed PostgreSQL validation');
    }
    console.log(`Verified ${routes.length} alternate routes against PostgreSQL`);
  }
} finally {
  await client.end();
  await driver.close();
}
