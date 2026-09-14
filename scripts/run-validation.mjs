import { writeFileSync } from 'node:fs';
import { connect, sqlFiles, transaction, projectRoot } from './lib/database.mjs';

export function extractChecks(sql, filename) {
  const checks = [];
  let current;
  for (const line of sql.split(/\r?\n/)) {
    const start = line.match(/^--\s*@check\s+(\S+)\s*$/);
    if (start) {
      if (current) throw new Error(`Nested check in ${filename}`);
      current = { name: start[1], filename, lines: [] };
    } else if (/^--\s*@end\s*$/.test(line)) {
      if (!current) throw new Error(`Unmatched end in ${filename}`);
      checks.push({ ...current, sql: current.lines.join('\n') });
      current = null;
    } else if (current) current.lines.push(line);
  }
  if (current) throw new Error(`Unclosed check in ${filename}`);
  return checks;
}
export async function validate(client) {
  const checks = sqlFiles('database/sample_queries').flatMap((f) => extractChecks(f.sql, f.filename));
  if (!checks.length) throw new Error('No validation checks found');
  return transaction(
    client,
    async () => {
      const results = [];
      for (const check of checks) {
        await client.query('savepoint validation_check');
        try {
          const result = await client.query(check.sql);
          await client.query('set constraints all immediate');
          const row = (Array.isArray(result) ? result.at(-1) : result).rows[0] ?? {};
          results.push({ name: check.name, filename: check.filename, ...row, status: row.status ?? 'FAIL' });
        } catch (error) {
          results.push({ name: check.name, filename: check.filename, status: 'FAIL', actual: error.message });
        } finally {
          await client.query('rollback to savepoint validation_check');
          await client.query('release savepoint validation_check');
        }
      }
      return results;
    },
    { rollback: true },
  );
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const client = await connect();
  let results;
  try {
    results = await validate(client);
  } finally {
    await client.end();
  }
  for (const row of results)
    console.log(`${row.status} ${row.name}${row.status === 'PASS' ? '' : ': ' + JSON.stringify(row.actual)}`);
  const failures = results.filter((r) => r.status !== 'PASS');
  console.log(
    `${results.length - failures.length}/${results.length} passed. All database changes rolled back.`,
  );
  if (process.argv.includes('--report')) {
    const cell = (v) => JSON.stringify(v ?? '').replaceAll('|', '\\|');
    writeFileSync(
      `${projectRoot}/database/docs/DATABASE_VALIDATION_REPORT.md`,
      [
        '# Database Validation Report',
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
        'Each check runs in its own savepoint; the enclosing transaction always rolls back.',
        `Passed: ${results.length - failures.length}/${results.length}`,
        '',
        '| Check | Status | Actual |',
        '| --- | --- | --- |',
        ...results.map((r) => `| ${r.name} | ${r.status} | ${cell(r.actual)} |`),
        '',
      ].join('\n'),
    );
  }
  if (failures.length) process.exitCode = 1;
}
