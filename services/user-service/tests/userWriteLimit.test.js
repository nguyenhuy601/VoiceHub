const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertUserActionAllowed,
  createUserRateLimitError,
  USER_RATE_LIMITED,
} = require('../src/utils/userWriteLimit');
const { toUserError } = require('../src/utils/userErrorMap');

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

function sliceMethod(src, name) {
  const start = src.indexOf(`async ${name}(`);
  assert.ok(start >= 0, name);
  const next = src.indexOf('\n  async ', start + 10);
  return src.slice(start, next === -1 ? src.length : next);
}

describe('assertUserActionAllowed', () => {
  it('lookup over limit throws USER_RATE_LIMITED and does not call the reader', async () => {
    let lookups = 0;
    const check = denyAfter(0);
    await assert.rejects(
      async () => {
        await assertUserActionAllowed({ userId: 'u1', bucket: 'lookup', checkRateLimit: check });
        lookups += 1;
      },
      (err) => err.errorCode === USER_RATE_LIMITED && err.statusCode === 429 && err.bucket === 'lookup'
    );
    assert.equal(lookups, 0);
  });

  it('profileWrite bucket is independent from lookup', async () => {
    await assert.rejects(
      () =>
        assertUserActionAllowed({
          userId: 'u1',
          bucket: 'lookup',
          checkRateLimit: denyAfter(0),
        }),
      (err) => err.errorCode === USER_RATE_LIMITED
    );
    await assertUserActionAllowed({
      userId: 'u1',
      bucket: 'profileWrite',
      checkRateLimit: allowCheck(),
    });
  });

  it('toUserError forwards 429 USER_RATE_LIMITED', () => {
    const mapped = toUserError(createUserRateLimitError());
    assert.equal(mapped.statusCode, 429);
    assert.equal(mapped.errorCode, USER_RATE_LIMITED);
    assert.match(mapped.messageUser, /Quá nhiều/);
  });

  it('no redis / limiter allows: does not invent 429 (D4)', async () => {
    await assertUserActionAllowed({
      userId: 'u1',
      bucket: 'lookup',
      checkRateLimit: async () => ({ allowed: true, remaining: 10 }),
    });
    await assertUserActionAllowed({
      userId: 'u1',
      bucket: 'profileWrite',
      checkRateLimit: async () => ({ allowed: true }),
    });
  });
});

describe('user controller source contract', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/controllers/user.controller.js'), 'utf8');

  it('getUserProfileByPhone asserts lookup before the service read', () => {
    const body = sliceMethod(src, 'getUserProfileByPhone');
    const gate = body.indexOf("bucket: 'lookup'");
    const read = body.indexOf('userService.getUserProfileByPhone');
    assert.ok(gate >= 0 && read > gate);
  });

  it('getUserProfileByUsername and searchUsers use the lookup bucket before reads', () => {
    for (const [name, call] of [
      ['getUserProfileByUsername', 'userService.getUserProfileByUsername'],
      ['searchUsers', 'userService.searchUsers'],
    ]) {
      const body = sliceMethod(src, name);
      const gate = body.indexOf("bucket: 'lookup'");
      const read = body.indexOf(call);
      assert.ok(gate >= 0 && read > gate, name);
    }
  });

  it('updateUserProfile asserts profileWrite before the 403 branch and the service write', () => {
    const body = sliceMethod(src, 'updateUserProfile');
    const gate = body.indexOf("bucket: 'profileWrite'");
    const forbidden = body.indexOf('Forbidden');
    const write = body.indexOf('userService.updateUserProfile');
    assert.ok(gate >= 0 && forbidden > gate && write > gate);
    assert.equal(src.split("bucket: 'profileWrite'").length - 1, 1);
  });
});
