const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('crypto');
const {
  assertPublicAcceptAllowed,
  assertOrgInviteAllowed,
  hashAcceptToken,
  ORG_RATE_LIMITED,
  LIMITER_UNAVAILABLE,
} = require('../src/utils/orgInviteLimit');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value).trim()).digest('hex');
}

describe('assertPublicAcceptAllowed', () => {
  it('non-string token is 400 and does not count', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        assertPublicAcceptAllowed({
          ip: '203.0.113.8',
          rawToken: { $ne: null },
          checkRateLimit: async () => {
            calls += 1;
            return { allowed: true, remaining: 1 };
          },
        }),
      (err) => err.statusCode === 400 && err.errorCode === 'VALIDATION_REQUIRED'
    );
    assert.equal(calls, 0);
    assert.equal(JSON.stringify({ $ne: null }).includes('[object Object]'), false);
  });

  it('IP over limit throws before the token bucket', async () => {
    const keys = [];
    await assert.rejects(
      () =>
        assertPublicAcceptAllowed({
          ip: '203.0.113.9',
          rawToken: 'plain-token',
          checkRateLimit: async ({ key }) => {
            keys.push(key);
            return { allowed: false, remaining: 0 };
          },
        }),
      (err) => err.statusCode === 429 && err.errorCode === ORG_RATE_LIMITED
    );
    assert.deepEqual(keys, ['org:accept:ip:203.0.113.9']);
  });

  it('token-hash over limit uses a different key than the IP bucket', async () => {
    const keys = [];
    const rawToken = 'plain-token';
    await assert.rejects(
      () =>
        assertPublicAcceptAllowed({
          ip: '203.0.113.10',
          rawToken,
          checkRateLimit: async ({ key }) => {
            keys.push(key);
            if (key.startsWith('org:accept:token:')) {
              return { allowed: false, remaining: 0 };
            }
            return { allowed: true, remaining: 1 };
          },
        }),
      (err) => err.statusCode === 429 && err.errorCode === ORG_RATE_LIMITED
    );
    assert.equal(keys.length, 2);
    assert.equal(keys[0], 'org:accept:ip:203.0.113.10');
    assert.equal(keys[1], `org:accept:token:${sha256(rawToken)}`);
    assert.equal(keys[0] === keys[1], false);
    assert.equal(keys[1].includes(rawToken), false);
    assert.equal(hashAcceptToken(rawToken), sha256(rawToken));
  });

  it('failOpen throws 503 and the error does not contain the token', async () => {
    const rawToken = 'secret-accept-token';
    await assert.rejects(
      () =>
        assertPublicAcceptAllowed({
          ip: '203.0.113.11',
          rawToken,
          checkRateLimit: async () => ({ allowed: true, remaining: 20, failOpen: true }),
        }),
      (err) => {
        assert.equal(err.statusCode, 503);
        assert.equal(err.errorCode, LIMITER_UNAVAILABLE);
        assert.equal(String(err.message).includes(rawToken), false);
        return true;
      }
    );
  });
});

describe('failOpen on invite link vs join', () => {
  it('createInviteLink denyWhenFailOpen throws 503', async () => {
    await assert.rejects(
      () =>
        assertOrgInviteAllowed({
          userId: 'u1',
          bucket: 'invite',
          denyWhenFailOpen: true,
          checkRateLimit: async () => ({ allowed: true, remaining: 20, failOpen: true }),
        }),
      (err) => err.statusCode === 503 && err.errorCode === LIMITER_UNAVAILABLE
    );
  });

  it('join failOpen does not throw', async () => {
    await assertOrgInviteAllowed({
      userId: 'u1',
      bucket: 'join',
      checkRateLimit: async () => ({ allowed: true, remaining: 20, failOpen: true }),
    });
  });
});

describe('accept and invite-link source contract', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/controllers/memberController.js'),
    'utf8'
  );
  const appSrc = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');

  function sliceExport(name) {
    const start = src.indexOf(`exports.${name} = async`);
    assert.ok(start >= 0, name);
    const next = src.indexOf('\nexports.', start + 10);
    return src.slice(start, next === -1 ? src.length : next);
  }

  it('accept gates before findOne and provision', () => {
    const body = sliceExport('acceptCompanyInvite');
    const gate = body.indexOf('assertPublicAcceptAllowed');
    const find = body.indexOf('CompanyInvite.findOne');
    const provision = body.indexOf('provisionUserByAdmin');
    assert.ok(gate >= 0 && find > gate && provision > gate);
    assert.equal(body.includes('String(req.body?.token'), false);
  });

  it('createInviteLink denies fail-open before jwt.sign', () => {
    const body = sliceExport('createInviteLink');
    const gate = body.indexOf('denyWhenFailOpen: true');
    const sign = body.indexOf('jwt.sign');
    assert.ok(gate >= 0 && sign > gate);
  });

  it('join does not deny fail-open', () => {
    const body = sliceExport('joinViaLink');
    assert.equal(body.includes('denyWhenFailOpen'), false);
  });

  it('trust proxy is one hop only when TRUST_PROXY=1', () => {
    assert.match(appSrc, /TRUST_PROXY === '1'/);
    assert.match(appSrc, /trust proxy',\s*1/);
  });
});
