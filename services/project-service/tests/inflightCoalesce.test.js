const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createInflightCoalesce } = require('../src/utils/inflightCoalesce');

describe('createInflightCoalesce', () => {
  it('shares one factory call for parallel waiters on the same key', async () => {
    const coalesce = createInflightCoalesce();
    let calls = 0;
    const factory = () =>
      new Promise((resolve) => {
        calls += 1;
        setTimeout(() => resolve('ok'), 20);
      });

    const [a, b, c] = await Promise.all([
      coalesce('u1:org1', factory),
      coalesce('u1:org1', factory),
      coalesce('u1:org1', factory),
    ]);

    assert.equal(calls, 1);
    assert.equal(a, 'ok');
    assert.equal(b, 'ok');
    assert.equal(c, 'ok');
  });

  it('runs a new factory after the first flight settles', async () => {
    const coalesce = createInflightCoalesce();
    let calls = 0;
    const factory = () => {
      calls += 1;
      return Promise.resolve(calls);
    };

    const first = await coalesce('k', factory);
    const second = await coalesce('k', factory);
    assert.equal(first, 1);
    assert.equal(second, 2);
    assert.equal(calls, 2);
  });

  it('does not share flights across different keys', async () => {
    const coalesce = createInflightCoalesce();
    let calls = 0;
    const factory = () => {
      calls += 1;
      return new Promise((resolve) => setTimeout(() => resolve(calls), 10));
    };

    await Promise.all([coalesce('a', factory), coalesce('b', factory)]);
    assert.equal(calls, 2);
  });
});
