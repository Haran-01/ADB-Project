import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(projectRoot, 'database', 'migrations');
const envPath = path.join(projectRoot, 'backend', '.env');

function loadEnv(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing env file: ${filePath}`);
  }

  const env = {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = value;
  }
  return env;
}

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function ensureMigrationTable(client) {
  await client.query('create schema if not exists railway_main');
  await client.query(`
    create table if not exists railway_main.schema_migrations (
      id bigserial primary key,
      filename text not null unique,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function run() {
  const env = loadEnv(envPath);
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing in backend/.env');
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await ensureMigrationTable(client);

    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = readFileSync(fullPath, 'utf8');
      const hash = checksum(sql);
      const existing = await client.query(
        'select checksum from railway_main.schema_migrations where filename = $1',
        [file],
      );

      if (existing.rowCount > 0) {
        if (existing.rows[0].checksum !== hash) {
          throw new Error(`Migration checksum changed after apply: ${file}`);
        }
        console.log(`Skipping already applied migration: ${file}`);
        continue;
      }

      console.log(`Applying migration: ${file}`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query(
          'insert into railway_main.schema_migrations (filename, checksum) values ($1, $2)',
          [file, hash],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }

    console.log('Migrations complete.');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

