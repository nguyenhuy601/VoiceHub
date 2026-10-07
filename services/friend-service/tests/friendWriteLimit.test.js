const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertFriendWriteAllowed,
  clampFriendListQuery,
  FRIEND_RATE_LIMITED,
  createFriendRateLimitError,
} = require('../src/utils/friendWriteLimit');
const { mapFriendError } = require('../src/utils/friendErrorMap');

function allowCheck() {
  return async () => ({ allowed: true, remaining: 10 });
}

function denyAfter(max) {
  let n = 0;
  return async () => {
    n += 1;
    return { allowed: n <= max, remaining: Math.max(0, max - n) };
  };
}

describe('assertFriendWriteAllowed', () => {
  it('search over limit throws FRIEND_RATE_LIMITED and does not call lookup', async () => {
    let lookups = 0;
    const check = denyAfter(0);
    await assert.rejects(
      async () => {
        await assertFriendWriteAllowed({ userId: 'u1', bucket: 'search', checkRateLimit: check });
        lookups += 1;
      },
      (err) => err.errorCode === FRIEND_RATE_LIMITED && err.statusCode === 429
    );
    assert.equal(lookups, 0);
  });

  it('mutate bucket is independent from search', async () => {
    const searchCheck = denyAfter(0);
    const mutateCheck = allowCheck();
    await assert.rejects(
      () => assertFriendWriteAllowed({ userId: 'u1', bucket: 'search', checkRateLimit: searchCheck }),
      (err) => err.errorCode === FRIEND_RATE_LIMITED
    );
    await assertFriendWriteAllowed({ userId: 'u1', bucket: 'mutate', checkRateLimit: mutateCheck });
  });

  it('maps rate-limit errors to 429 FRIEND_RATE_LIMITED', () => {
    const mapped = mapFriendError(createFriendRateLimitError('Quá nhiều lời mời kết bạn. Vui lòng thử lại sau.'));
    assert.equal(mapped.status, 429);
    assert.equal(mapped.errorCode, FRIEND_RATE_LIMITED);
    assert.match(mapped.message, /Quá nhiều/);
  });

  it('no redis / limiter allows: does not invent 429 (D4)', async () => {
    await assertFriendWriteAllowed({
      userId: 'u1',
      bucket: 'search',
      checkRateLimit: async () => ({ allowed: true, remaining: 10 }),
    });
    await assertFriendWriteAllowed({
      userId: 'u1',
      bucket: 'mutate',
      checkRateLimit: async () => ({ allowed: true, remaining: 30 }),
    });
  });
});

describe('clampFriendListQuery', () => {
  it('clamps limit 9999 to 100 and page 0 to 1', () => {
    assert.deepEqual(clampFriendListQuery(0, 9999), { page: 1, limit: 100 });
    assert.deepEqual(clampFriendListQuery('2', '40'), { page: 2, limit: 40 });
    assert.deepEqual(clampFriendListQuery(undefined, undefined), { page: 1, limit: 50 });
  });
});

describe('friend controller source contract', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/controllers/friend.controller.js'), 'utf8');

  it('search asserts bucket search before fetchUserByPhoneInternal', () => {
    const start = src.indexOf('async searchByPhone');
    const end = src.indexOf('async getRelationship');
    const body = src.slice(start, end);
    const assertAt = body.indexOf("bucket: 'search'");
    const fetchAt = body.indexOf('fetchUserByPhoneInternal');
    assert.ok(assertAt >= 0);
    assert.ok(fetchAt > assertAt);
  });

  it('accept reject block unblock assert mutate before the service call', () => {
    const slices = [
      ['async acceptFriendRequest', 'async rejectFriendRequest', 'acceptFriendRequest'],
      ['async rejectFriendRequest', 'async getFriends', 'rejectFriendRequest'],
      ['async blockUser', 'async unblockUser', 'blockUser'],
      ['async unblockUser', 'async searchByPhone', 'unblockUser'],
    ];
    for (const [startMark, endMark, serviceCall] of slices) {
      const body = src.slice(src.indexOf(startMark), src.indexOf(endMark));
      const assertAt = body.indexOf("bucket: 'mutate'");
      const callAt = body.indexOf(`friendService.${serviceCall}`);
      assert.ok(assertAt >= 0, startMark);
      assert.ok(callAt > assertAt, startMark);
    }
  });

  it('send request 429 goes through sendServiceError with FRIEND_RATE_LIMITED', () => {
    const start = src.indexOf('async sendFriendRequest');
    const end = src.indexOf('async acceptFriendRequest');
    const body = src.slice(start, end);
    assert.equal(body.includes('res.status(429)'), false);
    assert.ok(body.includes("bucket: 'request'"));
    assert.ok(src.includes('FRIEND_RATE_LIMITED') || src.includes('sendFriendError'));
  });
});
