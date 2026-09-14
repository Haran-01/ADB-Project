import { connect, transaction, sqlFiles } from './lib/database.mjs';

export async function seed(client) {
  await transaction(client, async () => {
    await client.query("select pg_advisory_xact_lock(hashtext('railway:migrations'))");
    for (const { sql } of sqlFiles('database/seeds')) {
      await client.query(sql.replace(/^begin;\s*$/gim, '').replace(/^commit;\s*$/gim, ''));
    }
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv.includes('--reset-demo'))
    throw new Error(
      'Seeding deletes railway data. Use npm run seed -- --reset-demo on a dedicated demo database.',
    );
  const client = await connect();
  try {
    await seed(client);
  } finally {
    await client.end();
  }
}
