const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { decideRateLimitOutcome, logRedisUnavailable } = require('../utils/redisRateLimit');

describe('decideRateLimitOutcome', () => {
  it('counted path has no failOpen flag', () => {
    const under = decideRateLimitOutcome({
      redisAvailable: true,
      incrThrew: false,
      count: 2,
      limit: 20,
    });
    assert.equal(under.allowed, true);
    assert.equal(under.remaining, 18);
    assert.equal(Object.prototype.hasOwnProperty.call(under, 'failOpen'), false);

    const over = decideRateLimitOutcome({
      redisAvailable: true,
      incrThrew: false,
      count: 21,
      limit: 20,
    });
    assert.equal(over.allowed, false);
    assert.equal(Object.prototype.hasOwnProperty.call(over, 'failOpen'), false);
  });

  it('missing client and INCR error stay allowed with failOpen', () => {
    for (const input of [
      { redisAvailable: false, incrThrew: false, limit: 8 },
      { redisAvailable: true, incrThrew: true, limit: 8 },
    ]) {
      const result = decideRateLimitOutcome(input);
      assert.equal(result.allowed, true);
      assert.equal(result.failOpen, true);
      assert.equal(result.remaining, 8);
    }
  });
});

describe('logRedisUnavailable', () => {
  it('logs reason only, at most once per minute, and never a token', () => {
    const calls = [];
    const state = { lastAt: 0 };
    const log = {
      warn(message, data) {
        calls.push({ message, data });
      },
    };
    const token = 'invite-token-should-not-appear';
    const t0 = 1_700_000_000_000;

    assert.equal(logRedisUnavailable(log, t0, state), true);
    assert.equal(logRedisUnavailable(log, t0 + 30_000, state), false);
    assert.equal(logRedisUnavailable(log, t0 + 61_000, state), true);

    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.deepEqual(call.data, { reason: 'redis_unavailable' });
      assert.equal(JSON.stringify(call).includes(token), false);
      assert.equal(JSON.stringify(call).includes('org:accept'), false);
    }
  });
});
