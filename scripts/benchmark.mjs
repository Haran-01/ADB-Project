import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createInMemoryDatabase, createLocalGraph } from './standalone-server.mjs';
import { createApp } from '../backend/src/app.js';
import { AnalysisService } from '../backend/src/modules/analysis/service.js';

const pool = await createInMemoryDatabase();
const graph = createLocalGraph(pool);
const app = createApp({ pool, graph, analysis: new AnalysisService(pool, graph), env: { NODE_ENV: 'test', HOST: '127.0.0.1' } });
const server = createServer(app).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
  const { data: { token } } = await login.json();
  const results = [];
  for (const path of ['/api/trains?limit=100', '/api/platforms', '/api/admin/graph', '/api/stations?limit=100']) {
    const call = async () => {
      const start = performance.now();
      const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200, path);
      await response.arrayBuffer();
      return performance.now() - start;
    };
    for (let i = 0; i < 3; i++) await call();
    for (const concurrency of [1, 8]) {
      const times = [];
      const start = performance.now();
      await Promise.all(Array.from({ length: concurrency }, async () => {
        for (let i = 0; i < 20; i++) times.push(await call());
      }));
      const elapsed = performance.now() - start;
      times.sort((a, b) => a - b);
      results.push({ path, concurrency, requests: times.length, median_ms: +times[Math.floor(times.length / 2)].toFixed(1), p95_ms: +times[Math.ceil(times.length * .95) - 1].toFixed(1), requests_per_second: +(times.length * 1000 / elapsed).toFixed(1) });
    }
  }
  console.log(JSON.stringify({ runtime: process.version, mode: 'isolated PGlite, expanded demo seeds, worker disabled', results }, null, 2));
} finally {
  await new Promise(resolve => server.close(resolve));
  await pool.close();
}
