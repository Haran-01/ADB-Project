import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from './helpers/database.mjs';
import { validate } from '../scripts/run-validation.mjs';
import { transaction } from '../scripts/lib/database.mjs';
import { seed } from '../scripts/run-seeds.mjs';
import { applyLogic } from '../scripts/apply-db-logic.mjs';

test('fresh PostgreSQL/PostGIS migrations, seed, SQL checks and repeatable application', async (t) => {
  const { client, db } = await testDatabase();
  t.after(() => client.end());
  await applyLogic(client);
  const before = await client.query('select * from railway_main.affected_trains order by id');
  const results = await validate(client);
  assert.deepEqual(
    results.filter((r) => r.status !== 'PASS'),
    [],
  );
  assert.deepEqual(
    (await client.query('select * from railway_main.affected_trains order by id')).rows,
    before.rows,
  );
  await seed(client);
  assert.deepEqual(
    (await validate(client)).filter((r) => r.status !== 'PASS'),
    [],
  );
  await t.test('invalid station geometry is rejected', () =>
    transaction(
      client,
      async () => {
        await assert.rejects(
          client.query("update railway_main.stations set latitude=0 where station_code='CGL'"),
          /stations_point_matches/,
        );
      },
      { rollback: true },
    ),
  );
  await t.test('recommendation requires an affected pair and rejected proposals cannot apply', async () => {
    await transaction(
      client,
      async () => {
        const {
          rows: [r],
        } = await client.query('select * from railway_main.route_recommendations limit 1');
        await client.query("update railway_main.route_recommendations set status='REJECTED' where id=$1", [
          r.id,
        ]);
        await assert.rejects(
          client.query('call railway_main.sp_apply_route_recommendation($1)', [r.id]),
          /cannot be applied/,
        );
      },
      { rollback: true },
    );
    await transaction(
      client,
      async () => {
        await assert.rejects(
          client.query(`update railway_main.route_recommendations set train_journey_id=
        (select id from railway_main.train_journeys where id not in(select train_journey_id from railway_main.affected_trains) limit 1)`),
          /recommendation_affected_pair_fk/,
        );
      },
      { rollback: true },
    );
  });
  await t.test('committed events notify listeners; rollback suppresses notifications', async () => {
    const notifications = [];
    const unsubscribe = await db.listen('railway_events', (payload) => notifications.push(payload));
    const {
      rows: [track],
    } = await client.query(
      "select tr.id from railway_main.tracks tr where status='ACTIVE' and not exists(select 1 from railway_main.disruptions where track_id=tr.id) limit 1",
    );
    await transaction(
      client,
      () => client.query("update railway_main.tracks set status='FAILED' where id=$1", [track.id]),
      { rollback: true },
    );
    assert.equal(notifications.length, 0);
    await transaction(client, () =>
      client.query("update railway_main.tracks set status='FAILED' where id=$1", [track.id]),
    );
    assert.ok(notifications.length >= 2);
    await unsubscribe();
  });
  await t.test('backend role works through RLS and cannot rewrite migrations', () =>
    transaction(
      client,
      async () => {
        await client.query('set local role railway_app');
        assert.equal((await client.query('select count(*)::int n from railway_main.stations')).rows[0].n, 25);
        assert.equal(
          (
            await client.query(
              "select has_table_privilege(current_user,'railway_main.schema_migrations','UPDATE') as allowed",
            )
          ).rows[0].allowed,
          false,
        );
      },
      { rollback: true },
    ),
  );
  await t.test('route validation rejects disconnected and time-expired edges', () =>
    transaction(
      client,
      async () => {
        assert.equal(
          (
            await client.query('select * from railway_main.fn_validate_route($1::jsonb)', [
              JSON.stringify(['CGL', 'NCJ']),
            ])
          ).rows[0].is_valid,
          false,
        );
        await client.query(
          "update railway_main.tracks set valid_to=now()+interval '1 minute' where from_station_id=(select id from railway_main.stations where station_code='KPD') and to_station_id=(select id from railway_main.stations where station_code='JTJ')",
        );
        assert.equal(
          (
            await client.query('select * from railway_main.fn_validate_route($1::jsonb)', [
              JSON.stringify(['KPD', 'JTJ']),
            ])
          ).rows[0].is_valid,
          false,
        );
      },
      { rollback: true },
    ),
  );
});
