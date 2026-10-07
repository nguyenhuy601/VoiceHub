const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';

const { createRequireOrgReadAccess } = require('../src/middleware/requireOrgReadAccess');
const { objectIdParam, requireMountedObjectIds } = require('../src/middleware/objectIdParam');

const ORG = '64b7f0c2a1b2c3d4e5f60700';
const USER = '64b7f0c2a1b2c3d4e5f60718';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function run(middleware, req) {
  const res = mockRes();
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

describe('requireOrgReadAccess (RULE-10)', () => {
  it('member / rolesOnly → next()', async () => {
    const mw = createRequireOrgReadAccess(async () => ({ ok: true, rolesOnly: true }));
    const { nextCalled, res } = await run(mw, { params: { orgId: ORG }, user: { id: USER } });
    assert.equal(nextCalled, true);
    assert.equal(res.body, null);
  });

  it('outsider → 403 ORG_ACCESS_DENIED', async () => {
    const calls = [];
    const mw = createRequireOrgReadAccess(async (userId, orgId) => {
      calls.push([userId, orgId]);
      return { ok: false };
    });
    const { nextCalled, res } = await run(mw, { params: { orgId: ORG }, user: { id: USER } });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.errorCode, 'ORG_ACCESS_DENIED');
    assert.deepEqual(calls, [[USER, ORG]]);
  });

  it('missing user → 403 without lookup', async () => {
    const mw = createRequireOrgReadAccess(async () => {
      throw new Error('should not be called');
    });
    const { res } = await run(mw, { params: { orgId: ORG } });
    assert.equal(res.statusCode, 403);
  });

  it('resolver error → 500 generic', async () => {
    const mw = createRequireOrgReadAccess(async () => {
      throw new Error('mongo down at 10.0.0.5');
    });
    const { res } = await run(mw, { params: { orgId: ORG }, user: { id: USER } });
    assert.equal(res.statusCode, 500);
    assert.doesNotMatch(JSON.stringify(res.body), /10\.0\.0\.5/);
  });
});

describe('objectIdParam', () => {
  it('router.param handler rejects invalid ids with 400 ORG_INVALID_ID', () => {
    const res = mockRes();
    let nextCalled = false;
    objectIdParam({}, res, () => { nextCalled = true; }, 'abc');
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'ORG_INVALID_ID');

    let ok = false;
    objectIdParam({}, mockRes(), () => { ok = true; }, ORG);
    assert.equal(ok, true);
  });

  it('requireMountedObjectIds checks mount params', async () => {
    const mw = requireMountedObjectIds(['orgId', 'deptId']);
    const bad = await run(mw, { params: { orgId: ORG, deptId: '{"$ne":null}' } });
    assert.equal(bad.res.statusCode, 400);
    const good = await run(mw, { params: { orgId: ORG } });
    assert.equal(good.nextCalled, true);
  });
});
