import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from './helpers/database.mjs';
import { loadEnv, transaction } from '../scripts/lib/database.mjs';
import { createNeo4j } from '../backend/src/db/neo4j.js';
import { GraphProjection } from '../backend/src/modules/routing/graph.js';
import { AnalysisService } from '../backend/src/modules/analysis/service.js';
import { EventWorker } from '../backend/src/workers/events.js';
import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as socketClient } from 'socket.io-client';

test(
  'real Aura graph rebuild and alternate routes from isolated PostgreSQL fixture',
  { skip: process.env.RUN_CLOUD_TESTS !== 'true', timeout: 120000 },
  async (t) => {
    const env = loadEnv();
    const driver = createNeo4j(env);
    const { client, db } = await testDatabase();
    const projection = `railway-test-${randomUUID()}`;
    const graph = new GraphProjection(driver, env.NEO4J_DATABASE, projection);
    t.after(async () => {
      const session = driver.session({ database: env.NEO4J_DATABASE });
      try {
        await session.run('MATCH (n:RailwayStation {projection:$projection}) DETACH DELETE n', {
          projection,
        });
      } finally {
        await session.close();
        await driver.close();
        await client.end();
      }
    });
    await graph.initialize();
    await graph.health();
    const counts = await transaction(client, () => graph.sync(client));
    assert.deepEqual(counts, { stations: 25, tracks: 60 });
    await transaction(client, () => graph.sync(client));
    const routes = await graph.routes('CGL', 'TPJ');
    assert.ok(routes.length);
    for (const route of routes) {
      assert.ok(!route.stationCodes.includes('VM'));
      assert.equal(
        (
          await client.query('select * from railway_main.fn_validate_route($1::jsonb)', [
            JSON.stringify(route.stationCodes),
          ])
        ).rows[0].is_valid,
        true,
      );
    }
    await t.test(
      'track update -> PostgreSQL NOTIFY -> worker -> Aura -> persisted routes -> Socket.IO',
      async () => {
        await client.query("update railway_main.event_log set status='PROCESSED',processed_at=now()");
        const server = createServer();
        const io = new Server(server);
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const socket = socketClient(`http://127.0.0.1:${server.address().port}`, {
          transports: ['websocket'],
        });
        await once(socket, 'connect');
        let listener;
        const errors = [];
        const listenerFactory = async () => {
          listener = new EventEmitter();
          let unsubscribe;
          listener.query = async () => {
            unsubscribe = await db.listen('railway_events', (payload) =>
              listener.emit('notification', { channel: 'railway_events', payload }),
            );
          };
          listener.end = async () => {
            if (unsubscribe) await unsubscribe();
          };
          return listener;
        };
        const analysis = new AnalysisService(client, graph);
        const worker = new EventWorker({
          pool: client,
          analysis,
          io,
          env: { ...env, WORKER_POLL_MS: 100 },
          listenerFactory,
          logger: {
            error(...args) {
              errors.push(args);
            },
          },
        });
        const completed = new Promise((resolve) => socket.once('disruption.analysis_completed', resolve));
        let timeout;
        try {
          worker.start();
          await worker.listening;
          await worker.pending;
          // Direct SQL exercises the trigger path without any API-created disruption.
          await client.query(`update railway_main.tracks set status='FAILED' where from_station_id=
          (select id from railway_main.stations where station_code='VM') and to_station_id=
          (select id from railway_main.stations where station_code='TPJ')`);
          const event = await Promise.race([
            completed,
            new Promise((_, reject) => {
              timeout = setTimeout(
                () => reject(new Error('End-to-end timeout: ' + JSON.stringify(errors))),
                45000,
              );
            }),
          ]);
          await worker.stop();
          assert.ok(event.event_id);
          assert.deepEqual(errors, []);
          const {
            rows: [summary],
          } = await client.query(
            `select count(*)::int n from railway_main.route_recommendations where disruption_id=$1`,
            [event.disruption_id],
          );
          assert.ok(summary.n >= 1);
        } finally {
          clearTimeout(timeout);
          await worker.stop();
          socket.disconnect();
          await new Promise((resolve) => io.close(resolve));
        }
      },
    );
  },
);
