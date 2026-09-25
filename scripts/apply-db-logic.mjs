import { createHash } from 'node:crypto';
import { connect, transaction, sqlFiles } from './lib/database.mjs';

export async function applyLogic(client) {
  await transaction(client, async () => {
    await client.query("select pg_advisory_xact_lock(hashtext('railway:migrations'))");
    for (const dir of ['views', 'functions', 'procedures', 'triggers']) {
      for (const { filename, sql } of sqlFiles(`database/${dir}`)) {
        const name = `${dir}/${filename}`;
        const checksum = createHash('sha256').update(sql).digest('hex');
        let previous;
        try {
          previous = await client.query(
            'select checksum from public.logic_artifacts where filename=$1',
            [name],
          );
        } catch (e) {
          previous = await client.query(
            'select checksum from railway_main.logic_artifacts where filename=$1',
            [name],
          );
        }
        // Replay the ordered set: later files may intentionally refine earlier functions.
        await client.query(sql);
        if (previous.rows[0]?.checksum === checksum) continue;
        await client.query(
          `insert into public.logic_artifacts(filename,checksum) values($1,$2)
          on conflict(filename) do update set checksum=excluded.checksum, applied_at=now()`,
          [name, checksum],
        );
        console.log(`Applied ${name}`);
      }
    }
    await client.query('revoke execute on all routines in schema public from public');
    await client.query('grant execute on all routines in schema public to railway_app');
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = await connect();
  try {
    await applyLogic(client);
  } finally {
    await client.end();
  }
}
