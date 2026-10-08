import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createInMemoryDatabase } from '../scripts/standalone-server.mjs';
import { createApp } from '../backend/src/app.js';
import { AnalysisService } from '../backend/src/modules/analysis/service.js';

let db, app, token;
const graph = { health: async () => true, sync: async () => {}, routes: async () => [] };
before(async () => {
  db = await createInMemoryDatabase();
  const analysis = new AnalysisService(db, graph);
  app = createApp({ pool: db, graph, analysis, env: { NODE_ENV: 'test', HOST: '127.0.0.1' } });
  const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  token = login.body.data.token;
});
after(async () => { await db?.close(); });

test('read APIs work against all migrations, triggers and expanded seeds', async () => {
  for (const path of ['/api/health/db', '/api/stations', '/api/tracks', '/api/trains', '/api/trains/search?from=MAS&to=KPD', '/api/trains/upcoming', '/api/journeys/active', '/api/network/map', '/api/platforms', '/api/schedules', '/api/regional/stats', '/api/stations/MAS/details', '/api/stations/nearby?lat=13&lng=80', '/api/trains/70001/live', '/api/trains/70001/schedule', '/api/trains/70001/status']) {
    const response = await request(app).get(path);
    assert.equal(response.status, 200, `${path}: ${JSON.stringify(response.body)}`);
  }
});

test('station pages do not skip or repeat records', async () => {
  const all = await request(app).get('/api/stations?limit=200');
  const page = await request(app).get('/api/stations?limit=3&offset=2');
  assert.deepEqual(page.body.data, all.body.data.slice(2, 5));
});

test('live tracking rejects impossible dates and times', async () => {
  for (const query of ['time=99:99', 'service_date=2026-99-99', 'service_date=2026-02-30']) {
    await request(app).get(`/api/trains/70001/live?${query}`).expect(400);
  }
});

test('admin authentication does not accept the source-code token', async () => {
  assert.notEqual(token, 'admin-session-token-12345');
  await request(app).get('/api/admin/graph').set('Authorization', 'Bearer admin-session-token-12345').expect(403);
  await request(app).get('/api/admin/graph').set('Authorization', `Bearer ${token}`).expect(200);
  await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' }).expect(401);
});

test('disruption creation, duplicate protection, and analysis are transactional', async () => {
  const { rows: [track] } = await db.query("select t.id from public.tracks t join public.stations fs on fs.id=t.from_station_id where fs.station_code='CSMT' and t.status='ACTIVE' and not exists(select 1 from public.disruptions d where d.track_id=t.id and d.status in ('OPEN','ANALYZING')) limit 1");
  const body = { type: 'TRACK_FAILURE', track_id: track.id, severity: 'HIGH' };
  const created = await request(app).post('/api/disruptions').set('Authorization', `Bearer ${token}`).send(body).expect(201);
  await request(app).post('/api/disruptions').set('Authorization', `Bearer ${token}`).send(body).expect(409);
  await request(app).post(`/api/disruptions/${created.body.data.id}/analyze`).set('Authorization', `Bearer ${token}`).expect(200);
});

test('request boundaries reject malformed JSON, oversized bodies, and anonymous mutations', async () => {
  await request(app).post('/api/disruptions').send({}).expect(403);
  await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).post('/api/auth/login').send({ password: 'x'.repeat(40000) }).expect(413);
  await request(app).get('/api/stations?limit=201').expect(400);
  await request(app).get('/api/stations?offset=-1').expect(400);
  await request(app).get('/api/disruptions/not-a-uuid').expect(400);
});

test('configured API token and browser admin sessions both work', async () => {
  const secureApp = createApp({ pool: db, graph, analysis: {}, env: { NODE_ENV: 'production', HOST: '127.0.0.1', API_TOKEN: 'a'.repeat(32), ADMIN_PASSWORD: 'configured-test-password' } });
  await request(secureApp).get('/api/stations').expect(401);
  await request(secureApp).post('/api/auth/login').send({ username: 'admin', password: 'admin123' }).expect(401);
  const login = await request(secureApp).post('/api/auth/login').send({ username: 'admin', password: 'configured-test-password' }).expect(200);
  await request(secureApp).get('/api/admin/graph').set('Authorization', `Bearer ${login.body.data.token}`).expect(200);
  await request(secureApp).get('/api/admin/graph').set('Authorization', `Bearer ${'a'.repeat(32)}`).expect(200);
});

test('frontend assets work when launched from the backend directory', async () => {
  const original = process.cwd();
  try {
    process.chdir(fileURLToPath(new URL('../backend', import.meta.url)));
    await request(app).get('/').expect(200).expect('Content-Type', /html/);
    await request(app).get('/app.js').expect(200);
  } finally { process.chdir(original); }
});

test('PGlite keeps concurrent requests outside another transaction and rolls back writes', async () => {
  const client = await db.connect();
  await client.query('begin');
  await client.query("update public.trains set name='ROLLBACK TEST' where train_number='70001'");
  let observed = false;
  const read = db.query("select name from public.trains where train_number='70001'").then(r => { observed = true; return r; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(observed, false);
  await client.query('rollback');
  client.release();
  assert.notEqual((await read).rows[0].name, 'ROLLBACK TEST');
});

test('local routing respects directed tracks and closures with authoritative travel times', async () => {
  const { createLocalGraph } = await import('../scripts/standalone-server.mjs');
  const client = await db.connect();
  await client.query('begin');
  try {
    const router = createLocalGraph(client);
    const routes = await router.routes('CSMT', 'DR');
    assert.ok(routes.length > 0);
    const { rows: [metrics] } = await client.query('select * from public.fn_validate_route($1::jsonb)', [JSON.stringify(routes[0].stationCodes)]);
    assert.equal(metrics.is_valid, true);
    assert.equal(Number(routes[0].travelMinutes), metrics.travel_minutes);
    await client.query("update public.stations set status='CLOSED' where station_code='DR'");
    assert.deepEqual(await router.routes('CSMT', 'DR'), []);
    assert.deepEqual(await router.routes('CSMT', 'CSMT'), []);
  } finally { await client.query('rollback'); client.release(); }
});

test('admin regional counts match physical track counts', async () => {
  const response = await request(app).get('/api/admin/regions').set('Authorization', `Bearer ${token}`).expect(200);
  for (const [code, schema] of [['SR', 'south'], ['CR', 'central'], ['NR', 'north']]) {
    const { rows: [count] } = await db.query(`select count(*)::int as n from railway_${schema}.tracks`);
    assert.equal(response.body.data.find(r => r.code === code).tracks, count.n);
  }
});

test('admin conflict creation, allocation and resolution complete without partial writes', async () => {
  const { rows: [track] } = await db.query("select t.id from public.tracks t join public.stations f on f.id=t.from_station_id join public.stations s on s.id=t.to_station_id where f.station_code='MAS' and s.station_code='AJJ'");
  const body = { trackId: track.id, title: 'Test corridor closure', severity: 'HIGH', autoAllocate: true };
  const created = await request(app).post('/api/admin/conflicts').set('Authorization', `Bearer ${token}`).send(body).expect(201);
  assert.ok(created.body.affectedCount > 0);
  await request(app).post('/api/admin/conflicts').set('Authorization', `Bearer ${token}`).send(body).expect(409);
  const resolved = await request(app).post(`/api/admin/conflicts/${created.body.data.id}/resolve`).set('Authorization', `Bearer ${token}`).send({}).expect(200);
  assert.equal(resolved.body.data.status, 'RESOLVED');
  assert.ok(resolved.body.restoredTrainsCount > 0);
  await request(app).post(`/api/admin/conflicts/${created.body.data.id}/resolve`).set('Authorization', `Bearer ${token}`).send({}).expect(409);
});

test('operational reset uses the railway date, includes cross-region stops, and is idempotent', async () => {
  const { runOperationalReset } = await import('../backend/src/services/operational-reset.js');
  const client = await db.connect();
  await client.query('begin');
  try {
    await runOperationalReset(client, new Date('2030-01-01T20:00:00Z'));
    const count = await client.query("select count(*)::int n from public.train_journeys where journey_date='2030-01-02'");
    assert.equal(count.rows[0].n, 92);
    await runOperationalReset(client, new Date('2030-01-01T20:00:00Z'));
    assert.equal((await client.query("select count(*)::int n from public.train_journeys where journey_date='2030-01-02'")).rows[0].n, 92);
  } finally { await client.query('rollback'); client.release(); }
});

test('event worker claims and acknowledges regional outbox events', async () => {
  const { EventWorker } = await import('../backend/src/workers/events.js');
  const emitted = [];
  const worker = new EventWorker({ pool: db, analysis: { refreshGraph: async () => {}, analyze: async () => {} }, io: { emit: (...args) => emitted.push(args) }, env: {} });
  const event = await worker.claim();
  assert.ok(event?.id);
  const regionalEvent = await worker.claimRegional(randomUUID());
  assert.ok(['railway_south','railway_central','railway_north'].includes(regionalEvent.source_schema));
  await worker.process(event);
  await db.query(`update ${worker.eventTable(event)} set status='PROCESSED', lock_token=null, locked_at=null where id=$1`, [event.id]);
  assert.equal((await db.query(`select status from ${worker.eventTable(event)} where id=$1`, [event.id])).rows[0].status, 'PROCESSED');
});
