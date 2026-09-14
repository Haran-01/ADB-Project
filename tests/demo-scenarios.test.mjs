import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarioDefinition } from '../scripts/run-demo-scenario.mjs';

test('demo scenarios cover failure, closure, and maintenance pathways', () => {
  assert.deepEqual(
    ['track-failure', 'station-closure', 'maintenance'].map((name) => scenarioDefinition(name).type),
    ['TRACK_FAILURE', 'STATION_CLOSURE', 'MAINTENANCE'],
  );
  assert.equal(scenarioDefinition('station-closure').target, 'station_id');
  assert.equal(scenarioDefinition('maintenance').target, 'track_id');
});
