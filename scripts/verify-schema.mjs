import { connect } from './lib/database.mjs';

async function run() {
  const client = await connect();
  try {
    const postgis = await client.query('select postgis_full_version() as version');
    const migrations = await client.query(
      'select count(*)::int as count from railway_main.schema_migrations',
    );
    const tables = await client.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'railway_main'
        and table_type = 'BASE TABLE'
      order by table_name
    `);
    const enums = await client.query(`
      select t.typname as enum_name
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'railway_main'
        and t.typtype = 'e'
      order by t.typname
    `);
    const spatialColumns = await client.query(`
      select c.table_name, c.column_name, c.udt_schema, c.udt_name
      from information_schema.columns c
      where c.table_schema = 'railway_main'
        and c.udt_name = 'geography'
      order by c.table_name, c.column_name
    `);
    const constraints = await client.query(`
      select count(*)::int as count
      from information_schema.table_constraints
      where table_schema = 'railway_main'
        and constraint_type in ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
    `);

    if (
      migrations.rows[0].count < 7 ||
      tables.rows.length < 17 ||
      enums.rows.length !== 13 ||
      spatialColumns.rows.length !== 3
    )
      process.exitCode = 1;
    console.log('PostGIS: available');
    console.log(`PostGIS version string length: ${postgis.rows[0].version.length}`);
    console.log(`Applied migrations: ${migrations.rows[0].count}`);
    console.log(`Base tables: ${tables.rows.length}`);
    console.log(`Enums: ${enums.rows.length}`);
    console.log(`Spatial geography columns: ${spatialColumns.rows.length}`);
    console.log(`PK/FK/unique/check constraints: ${constraints.rows[0].count}`);
    console.log('Tables:', tables.rows.map((row) => row.table_name).join(', '));
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
