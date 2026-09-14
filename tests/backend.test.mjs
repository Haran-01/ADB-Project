import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as socketClient } from 'socket.io-client';
import { once } from 'node:events';
import { createApp } from '../backend/src/app.js';
import { AnalysisService } from '../backend/src/modules/analysis/service.js';
import { EventWorker } from '../backend/src/workers/events.js';
import { testDatabase } from './helpers/database.mjs';
import { transaction } from '../scripts/lib/database.mjs';

test('API, analysis, route application and outbox integration', async (t) => {
  const { client } = await testDatabase();
  t.after(() => client.end());
  // Unit boundary for Neo4j; cloud.test.mjs verifies the real Cypher implementation separately.
  const graph = {
    health: async () => true,
    sync: async () => {},
    routes: async () => [{ stationCodes: ['CGL', 'KPD', 'JTJ', 'SA', 'KRR', 'TPJ'] }],
  };
  const analysis = new AnalysisService(client, graph);
  const env = {
    NODE_ENV: 'test',
    FRONTEND_ORIGIN: 'http://localhost:5173',
    API_TOKEN: 'test-token-at-least-24-characters',
  };
  const app = createApp({ pool: client, graph, analysis, env });
  const api = request(app);
  const auth = { Authorization: `Bearer ${env.API_TOKEN}` };
  const d = (await client.query("select id from railway_main.disruptions where type='TRACK_FAILURE'"))
    .rows[0];
  await t.test('health, authorization, limits, identifiers and all read models', async () => {
    await api.get('/api/health').expect(200);
    await api.get('/api/health/db').expect(200);
    await api.get('/api/health/neo4j').expect(200);
    await api.get('/api/stations').expect(401);
    for (const endpoint of [
      'stations',
      'tracks',
      'trains',
      'journeys/active',
      'network/map',
      'disruptions',
      `disruptions/${d.id}/affected-trains`,
      `disruptions/${d.id}/recommendations`,
    ])
      await api.get(`/api/${endpoint}`).set(auth).expect(200);
    await api.get('/api/stations?limit=10000').set(auth).expect(400);
    await api.post('/api/disruptions/invalid/analyze').set(auth).expect(400);
    await api
      .post('/api/disruptions')
      .set(auth)
      .send({ type: 'TRACK_FAILURE', severity: 'HIGH' })
      .expect(400);
  });
  await t.test('analysis uses remaining journey; application is guarded and idempotent', async () => {
    const response = await api.post(`/api/disruptions/${d.id}/analyze`).set(auth).expect(200);
    assert.equal(response.body.data.affected_trains, 1); // Vaigai already passed CGL -> VM.
    assert.equal(response.body.data.recommendations, 1);
    await api.post(`/api/disruptions/${d.id}/analyze`).set(auth).expect(200);
    const {
      rows: [recommendation],
    } = await client.query(
      "select * from railway_main.route_recommendations where recommended_route->>0='CGL'",
    );
    await api.post(`/api/recommendations/${recommendation.id}/apply`).set(auth).expect(200);
    await api.post(`/api/recommendations/${recommendation.id}/apply`).set(auth).expect(200);
    const {
      rows: [history],
    } = await client.query(
      'select count(*)::int n from railway_main.journey_status_history where train_journey_id=$1',
      [recommendation.train_journey_id],
    );
    assert.equal(history.n, 1);
    const {
      rows: [other],
    } = await client.query(
      "select id from railway_main.route_recommendations where train_journey_id=$1 and status='EXPIRED'",
      [recommendation.train_journey_id],
    );
    await api.post(`/api/recommendations/${other.id}/apply`).set(auth).expect(409);
    assert.equal(
      (await client.query('select status from railway_main.disruptions where id=$1', [d.id])).rows[0].status,
      'ANALYZING',
    );
  });
  await t.test('creating a failure atomically creates history/outbox and rejects duplicates', async () => {
    const {
      rows: [track],
    } = await client.query(
      "select id from railway_main.tracks where status='ACTIVE' and id not in(select track_id from railway_main.disruptions where track_id is not null) limit 1",
    );
    const input = { type: 'TRACK_FAILURE', track_id: track.id, severity: 'HIGH' };
    const response = await api.post('/api/disruptions').set(auth).send(input).expect(201);
    await api.post('/api/disruptions').set(auth).send(input).expect(409);
    assert.equal(
      (await client.query('select status from railway_main.tracks where id=$1', [track.id])).rows[0].status,
      'FAILED',
    );
    assert.equal(
      (
        await client.query(
          "select count(*)::int n from railway_main.event_log where entity_id=$1 and event_type='DISRUPTION_CREATED'",
          [response.body.data.id],
        )
      ).rows[0].n,
      1,
    );
  });
  await t.test('durable outbox emits to a real Socket.IO client without NOTIFY', async () => {
    const server = createServer();
    const io = new Server(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const socket = socketClient(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'] });
    await once(socket, 'connect');
    const received = new Promise((resolve) => socket.once('route.recommended', resolve));
    const worker = new EventWorker({
      pool: client,
      analysis: { analyze: async () => {} },
      io,
      env,
      logger: { error() {} },
    });
    try {
      worker.stopped = false;
      await worker.drain();
      const event = await Promise.race([
        received,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Socket event timeout')), 3000).unref()),
      ]);
      assert.ok(event.event_id);
      assert.equal(
        (await client.query("select count(*)::int n from railway_main.event_log where status='PENDING'"))
          .rows[0].n,
        0,
      );
    } finally {
      worker.stopped = true;
      socket.disconnect();
      await new Promise((resolve) => io.close(resolve));
    }
  });
  await t.test('failed work retries, exhausted work dead-letters, expired leases recover', async () => {
    const worker = new EventWorker({
      pool: client,
      analysis: {
        analyze: async () => {
          throw new Error('graph offline');
        },
      },
      io: { emit() {} },
      env,
      logger: { error() {} },
    });
    await client.query("update railway_main.disruptions set analysis_status='PENDING' where id=$1", [d.id]);
    const {
      rows: [event],
    } = await client.query(
      "insert into railway_main.event_log(event_type,entity_type,entity_id) values('DISRUPTION_CREATED','disruptions',$1) returning id",
      [d.id],
    );
    worker.stopped = false;
    await worker.drain();
    worker.stopped = true;
    const {
      rows: [retry],
    } = await client.query('select * from railway_main.event_log where id=$1', [event.id]);
    assert.equal(retry.status, 'PENDING');
    assert.equal(retry.attempts, 1);
    assert.ok(retry.available_at);
    await client.query(
      "update railway_main.event_log set attempts=4,available_at=now()-interval '1 minute' where id=$1",
      [event.id],
    );
    worker.stopped = false;
    await worker.drain();
    worker.stopped = true;
    assert.equal(
      (await client.query('select status from railway_main.event_log where id=$1', [event.id])).rows[0]
        .status,
      'FAILED',
    );
    await transaction(
      client,
      async () => {
        await client.query(
          "update railway_main.event_log set status='PROCESSING',attempts=1,locked_at=now()-interval '5 minutes' where id=$1",
          [event.id],
        );
        assert.equal((await worker.claim()).id, event.id);
      },
      { rollback: true },
    );
  });
});
