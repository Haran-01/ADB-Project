import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { getEnv } from './config/env.js';
import { createPostgres } from './db/postgres.js';
import { createNeo4j } from './db/neo4j.js';
import { createApp, authorized } from './app.js';
import { GraphProjection } from './modules/routing/graph.js';
import { AnalysisService } from './modules/analysis/service.js';
import { EventWorker } from './workers/events.js';
import { scheduleOperationalReset } from './services/operational-reset.js';

const env = getEnv();
const pool = createPostgres(env);
const driver = createNeo4j(env);
const graph = new GraphProjection(driver, env.NEO4J_DATABASE);
const analysis = new AnalysisService(pool, graph);
const server = createServer(createApp({ env, pool, graph, analysis }));
const io = new Server(server, {
  cors: { origin: [...new Set([env.FRONTEND_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'])] },
  maxHttpBufferSize: 32768,
});
io.use((socket, next) =>
  authorized(socket.handshake.auth?.token, env.API_TOKEN) ? next() : next(new Error('Unauthorized')),
);
const worker = new EventWorker({ pool, analysis, io, env });
server.listen(env.PORT, env.HOST, () => {
  console.log(`Railway API listening on http://${env.HOST}:${env.PORT}`);
  if (env.WORKER_ENABLED === 'true') worker.start();
  scheduleOperationalReset(pool);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const watchdog = setTimeout(() => process.exit(1), 20000).unref();
  await worker.stop();
  await new Promise((resolve) => io.close(resolve));
  await pool.end();
  await driver.close();
  clearTimeout(watchdog);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
