import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';
import { setTimeout as delay } from 'node:timers/promises';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export function loadEnv() {
  const file = path.join(projectRoot, 'backend/.env');
  return { ...(existsSync(file) ? dotenv.parse(readFileSync(file)) : {}), ...process.env };
}
export function postgresConfig(env = loadEnv(), key = 'DATABASE_URL') {
  if (!env[key]) throw new Error(`${key} is required (environment or backend/.env)`);
  const url = new URL(env[key]);
  const mode = env.DATABASE_SSL_MODE ?? url.searchParams.get('sslmode') ?? 'verify-full';
  if (!['verify-full', 'disable', 'require'].includes(mode)) throw new Error('Invalid DATABASE_SSL_MODE');
  for (const name of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(name);
  if (mode === 'require' && env.ALLOW_INSECURE_DB_TLS !== 'true') {
    throw new Error('Unverified TLS requires explicit ALLOW_INSECURE_DB_TLS=true');
  }
  return {
    connectionString: url.toString(),
    ssl:
      mode === 'disable'
        ? false
        : {
            rejectUnauthorized: mode === 'verify-full',
            ...(env.DATABASE_CA_FILE ? { ca: readFileSync(env.DATABASE_CA_FILE, 'utf8') } : {}),
          },
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    options: '-c search_path=public,railway_south,railway_central,railway_north,extensions -c timezone=UTC',
    application_name: 'railway-management',
  };
}
export async function connect(env = loadEnv(), key = 'DATABASE_URL') {
  for (let attempt = 0; ; attempt++) {
    const client = new pg.Client(postgresConfig(env, key));
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => {});
      if (attempt >= 2 || !['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', '57P03'].includes(error.code))
        throw error;
      await delay(250 * 2 ** attempt);
    }
  }
}
export async function transaction(client, fn, { rollback = false } = {}) {
  await client.query('begin');
  try {
    const result = await fn(client);
    await client.query(rollback ? 'rollback' : 'commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
export function sqlFiles(dir) {
  return readdirSync(path.join(projectRoot, dir))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ filename: f, sql: readFileSync(path.join(projectRoot, dir, f), 'utf8') }));
}
