import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const seedsDir = path.join(projectRoot, 'database', 'seeds');
const envPath = path.join(projectRoot, 'backend', '.env');

function loadEnv(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing env file: ${filePath}`);
  }

  const env = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function run() {
  const env = loadEnv(envPath);
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing in backend/.env');
  }

  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const files = readdirSync(seedsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`Running seed: ${file}`);
      const sql = readFileSync(path.join(seedsDir, file), 'utf8');
      await client.query(sql);
    }

    console.log('Seed data loaded.');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

