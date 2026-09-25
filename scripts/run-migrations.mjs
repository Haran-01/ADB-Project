import { createHash } from 'node:crypto';
import { connect, transaction, sqlFiles } from './lib/database.mjs';

export async function migrate(client) {
  await client.query("select pg_advisory_lock(hashtext('railway:migrations'))");
  try {
    await client.query(`create schema if not exists public;
      create table if not exists public.schema_migrations (
        id bigserial primary key, filename text not null unique,
        checksum text not null, applied_at timestamptz not null default now())`);
    for (const { filename, sql } of sqlFiles('database/migrations')) {
      const checksum = createHash('sha256').update(sql).digest('hex');
      let existing;
      try {
        existing = await client.query(
          'select checksum from public.schema_migrations where filename=$1',
          [filename],
        );
      } catch (e) {
        existing = await client.query(
          'select checksum from railway_main.schema_migrations where filename=$1',
          [filename],
        );
      }
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${filename}`);
        continue;
      }
      await transaction(client, async () => {
        await client.query(sql);
        await client.query('insert into public.schema_migrations(filename,checksum) values($1,$2) on conflict (filename) do update set checksum=excluded.checksum', [
          filename,
          checksum,
        ]);
      });
      console.log(`Applied ${filename}`);
    }
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('railway:migrations'))");
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = await connect();
  try {
    await migrate(client);
  } finally {
    await client.end();
  }
}
