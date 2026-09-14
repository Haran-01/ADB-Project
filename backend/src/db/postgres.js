import pg from 'pg';
import { postgresConfig } from '../../../scripts/lib/database.mjs';
export function createPostgres(env) {
  const pool = new pg.Pool({ ...postgresConfig(env), max: 10, idleTimeoutMillis: 30000 });
  pool.on('error', (error) => console.error('PostgreSQL pool error', error.code ?? 'unknown'));
  return pool;
}
