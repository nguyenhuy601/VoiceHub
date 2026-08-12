const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { runWithConcurrency, chunkArray } = require('../src/utils/runWithConcurrency');

describe('runWithConcurrency', () => {
  it('preserves order and respects concurrency ceiling', async () => {
    const active = { n: 0, max: 0 };
    const out = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (x) => {
      active.n += 1;
      active.max = Math.max(active.max, active.n);
      await new Promise((r) => setTimeout(r, 20));
      active.n -= 1;
      return x * 10;
    });
    assert.deepEqual(out, [10, 20, 30, 40, 50]);
    assert.ok(active.max <= 2);
  });

  it('handles empty list', async () => {
    const out = await runWithConcurrency([], 4, async () => 1);
    assert.deepEqual(out, []);
  });
});

describe('chunkArray', () => {
  it('splits into fixed chunks', () => {
    assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunkArray([], 50), []);
  });
});
