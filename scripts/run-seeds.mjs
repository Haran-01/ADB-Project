import { connect, transaction, sqlFiles } from './lib/database.mjs';
import { expandTrainData } from './expand-train-data.mjs';

export async function seed(client, options = {}) {
  await transaction(client, async () => {
    await client.query("select pg_advisory_xact_lock(hashtext('railway:migrations'))");
    for (const { sql } of sqlFiles('database/seeds')) {
      await client.query(sql.replace(/^begin;\s*$/gim, '').replace(/^commit;\s*$/gim, ''));
    }
    if (options.expand) {
      for (const { sql } of sqlFiles('database/seeds/extra_nodes')) {
        await client.query(sql.replace(/^begin;\s*$/gim, '').replace(/^commit;\s*$/gim, ''));
      }
    }
  });

  if (options.expand) {
    await expandTrainData(client);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv.includes('--reset-demo'))
    throw new Error(
      'Seeding deletes railway data. Use npm run seed -- --reset-demo on a dedicated demo database.',
    );
  const client = await connect();
  try {
    await seed(client, { expand: true });
  } finally {
    await client.end();
  }
}
