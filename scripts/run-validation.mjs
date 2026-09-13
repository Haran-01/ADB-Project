import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, 'backend', '.env');
const validationDir = path.join(projectRoot, 'database', 'sample_queries');
const validationFiles = readdirSync(validationDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => path.join(validationDir, file));
const reportPath = path.join(projectRoot, 'database', 'docs', 'DATABASE_VALIDATION_REPORT.md');

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

function extractChecks(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const checks = [];
  let current = null;

  for (const line of lines) {
    const start = line.match(/^--\s*@check\s+([a-zA-Z0-9_:-]+)\s*$/);
    if (start) {
      if (current) throw new Error(`Nested @check in ${filePath}`);
      current = { name: start[1], sql: [] };
      continue;
    }
    if (/^--\s*@end\s*$/.test(line)) {
      if (!current) throw new Error(`@end without @check in ${filePath}`);
      checks.push({ ...current, file: path.relative(projectRoot, filePath) });
      current = null;
      continue;
    }
    if (current) current.sql.push(line);
  }

  if (current) throw new Error(`Unclosed @check ${current.name} in ${filePath}`);
  return checks.map((check) => ({ ...check, sql: check.sql.join('\n').trim() }));
}

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replace(/\r?\n/g, ' ');
}

function escapeCell(value) {
  return formatValue(value).replaceAll('|', '\\|');
}

async function run() {
  const env = loadEnv(envPath);
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is missing in backend/.env');

  const checks = validationFiles.flatMap(extractChecks);
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  const results = [];
  try {
    for (const check of checks) {
      const queryResult = await client.query(check.sql);
      const result = Array.isArray(queryResult) ? queryResult.at(-1) : queryResult;
      const row = result.rows[0] ?? {};
      const status = row.status ?? 'UNKNOWN';
      results.push({
        file: check.file,
        checkName: check.name,
        actual: row.actual,
        expected: row.expected,
        status,
      });
      console.log(`${status} ${check.name}`);
    }
  } finally {
    await client.end();
  }

  const failures = results.filter((result) => result.status !== 'PASS');
  const generatedAt = new Date().toISOString();
  const lines = [
    '# Database Validation Report',
    '',
    `Generated at: ${generatedAt}`,
    '',
    'Phase 5 validates the Supabase PostgreSQL/PostGIS database before backend APIs are built.',
    '',
    '## Summary',
    '',
    `- Total checks: ${results.length}`,
    `- Passed: ${results.length - failures.length}`,
    `- Failed: ${failures.length}`,
    '',
    failures.length === 0
      ? 'All validation checks passed.'
      : 'Some validation checks failed. Review the detailed table below.',
    '',
    '## Validation Files',
    '',
    '- `database/sample_queries/validation.sql`',
    '- `database/sample_queries/business_queries.sql`',
    '- `database/sample_queries/phase6_logic_validation.sql`',
    '',
    '## Detailed Results',
    '',
    '| Check | Source | Status | Actual | Expected |',
    '| --- | --- | --- | --- | --- |',
    ...results.map((result) => (
      `| \`${escapeCell(result.checkName)}\` | \`${escapeCell(result.file)}\` | ${escapeCell(result.status)} | ${escapeCell(result.actual)} | ${escapeCell(result.expected)} |`
    )),
    '',
    '## Scope Notes',
    '',
    '- Trigger behavior is intentionally reported as not present yet because active triggers belong to Phase 7.',
    '- Phase 6 views, functions, and procedures are now expected to exist and are validated here.',
    '- This validation proves seeded relational joins, constraints, indexes, history rows, PostGIS queries, core business queries, and SQL-first database logic work directly in PostgreSQL.',
    '',
  ];

  writeFileSync(reportPath, lines.join('\n'));
  if (failures.length > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
