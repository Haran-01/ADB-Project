import test from 'node:test';
import assert from 'node:assert/strict';
import { DistributedQueryEngine } from '../backend/src/db/distributed.js';

test('scatter-gather paginates the globally ordered union', async () => {
  const fragments = { south: [1, 4, 7], central: [2, 5, 8], north: [3, 6, 9] };
  const engine = new DistributedQueryEngine({
    async query(sql, [limit, offset = 0]) {
      const region = sql.match(/railway_(south|central|north)/)[1];
      return { rows: fragments[region].slice(offset, offset + limit).map(id => ({ id })) };
    },
  });
  assert.deepEqual((await engine.scatterGather('stations', 'id', 3, 2)).map(r => r.id), [3, 4, 5]);
});

test('fragment failures propagate instead of silently omitting data', async () => {
  const engine = new DistributedQueryEngine({ query: async () => { throw new Error('offline'); } });
  await assert.rejects(engine.scatterGather('stations'), /offline/);
  await assert.rejects(engine.crossFragmentJoinTrainSchedules(), /offline/);
});
