import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, 'backend', '.env');
const artifactDirs = ['views', 'functions', 'procedures'].map((dir) => path.join(projectRoot, 'database', dir));

function loadEnv(filePath) {
  if (!existsSync(filePath)) throw new Error(`Missing env file: ${filePath}`);
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
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing in backend/.env');

  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    for (const dir of artifactDirs) {
      const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const relative = path.relative(projectRoot, fullPath);
        console.log(`Applying database logic artifact: ${relative}`);
        await client.query(readFileSync(fullPath, 'utf8'));
      }
    }
    console.log('Database logic artifacts applied.');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

