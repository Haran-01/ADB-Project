import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { migrate } from '../../scripts/run-migrations.mjs';
import { applyLogic } from '../../scripts/apply-db-logic.mjs';
import { seed } from '../../scripts/run-seeds.mjs';

export async function testDatabase() {
  const db = new PGlite({ extensions: { postgis, pgcrypto } });
  const client = {
    async query(sql, params) {
      const results = params?.length ? [await db.query(sql, params)] : await db.exec(sql);
      for (const r of results) r.rowCount = r.affectedRows ?? r.rows.length;
      return results.length === 1 ? results[0] : results;
    },
    release() {},
    async end() {
      await db.close();
    },
    async connect() {
      return client;
    },
  };
  await client.query(
    'create schema extensions; set search_path=railway_main,extensions,public; set timezone=UTC;',
  );
  await migrate(client);
  await seed(client);
  await applyLogic(client);
  return { client, db };
}
