import { connect } from './lib/database.mjs';

async function run() {
  const client = await connect();
  try {
    const postgis = await client.query('select postgis_full_version() as version');
    const migrations = await client.query(
      'select count(*)::int as count from public.schema_migrations',
    );
    const mainExists = await client.query(
      "select 1 from information_schema.schemata where schema_name = 'railway_main'",
    );
    const tables = await client.query(`
      select table_schema, table_name
      from information_schema.tables
      where table_schema in ('railway_south', 'railway_central', 'railway_north')
        and table_type = 'BASE TABLE'
      order by table_schema, table_name
    `);
    const enums = await client.query(`
      select t.typname as enum_name
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typtype = 'e'
      order by t.typname
    `);
    const spatialColumns = await client.query(`
      select c.table_schema, c.table_name, c.column_name
      from information_schema.columns c
      where c.table_schema in ('railway_south', 'railway_central', 'railway_north')
        and c.udt_name = 'geography'
      order by c.table_schema, c.table_name
    `);

    if (
      mainExists.rows.length > 0 ||
      migrations.rows[0].count < 7 ||
      tables.rows.length < 30 ||
      enums.rows.length < 10
    )
      process.exitCode = 1;
    console.log('PostGIS: available');
    console.log(`railway_main schema removed: ${mainExists.rows.length === 0}`);
    console.log(`Applied migrations: ${migrations.rows[0].count}`);
    console.log(`Regional physical base tables: ${tables.rows.length}`);
    console.log(`Public Enums: ${enums.rows.length}`);
    console.log(`Spatial geography columns: ${spatialColumns.rows.length}`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
