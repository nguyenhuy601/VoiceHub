const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { setMock, mockRes } = require('./helpers/authServiceMocks');

const middlewarePath = path.resolve(__dirname, '../src/middleware/companyAdminAuth.js');
const clientPath = path.resolve(__dirname, '../src/clients/orgMembership.client.js');

const ORG_ID = '64b000000000000000000001';
const TARGET_ID = '64b0000000000000000000aa';

function makeReq({ userId = TARGET_ID, systemRole = 'employee', withTarget = true } = {}) {
  return {
    headers: { 'x-organization-id': ORG_ID },
    params: withTarget ? { userId } : {},
    body: {},
    query: {},
    user: { id: '64b0000000000000000000ff', systemRole },
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

describe('companyAdminAuth target user scope', () => {
  let level;
  let membership;
  let memberCalls;

  beforeEach(() => {
    delete require.cache[middlewarePath];
    level = 'full';
    membership = true;
    memberCalls = 0;
    setMock(clientPath, {
      resolveCompanyAdminLevel: async (actor) =>
        String(actor?.systemRole) === 'admin' ? 'system' : level,
      isActiveOrgMember: async () => {
        memberCalls += 1;
        return membership;
      },
    });
  });

  afterEach(() => {
    delete require.cache[middlewarePath];
    delete require.cache[clientPath];
  });

  it('active member target -> next()', async () => {
    const { companyAdminAuth } = require(middlewarePath);
    const { nextCalled, res } = await run(companyAdminAuth(), makeReq());
    assert.equal(nextCalled, true);
    assert.equal(res.body, undefined);
    assert.equal(memberCalls, 1);
  });

  it('target outside the organization -> 404 AUTH_TARGET_NOT_FOUND', async () => {
    membership = false;
    const { companyAdminAuth } = require(middlewarePath);
    const { nextCalled, res } = await run(companyAdminAuth(), makeReq());
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.errorCode, 'AUTH_TARGET_NOT_FOUND');
  });

  it('org-service unavailable -> 503 AUTH_SCOPE_UNAVAILABLE', async () => {
    membership = 'unavailable';
    const { companyAdminAuth } = require(middlewarePath);
    const { res } = await run(companyAdminAuth(), makeReq());
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.errorCode, 'AUTH_SCOPE_UNAVAILABLE');
  });

  it('system admin bypasses the membership lookup', async () => {
    membership = false;
    const { companyAdminAuth } = require(middlewarePath);
    const { nextCalled } = await run(companyAdminAuth(), makeReq({ systemRole: 'admin' }));
    assert.equal(nextCalled, true);
    assert.equal(memberCalls, 0);
  });

  it('invalid ObjectId target -> 400 AUTH_INVALID_ID without calling org-service', async () => {
    const { companyAdminAuth } = require(middlewarePath);
    const { res } = await run(companyAdminAuth(), makeReq({ userId: 'not-an-id' }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'AUTH_INVALID_ID');
    assert.equal(memberCalls, 0);
  });

  it('hr on a full-access route is still 403 before the target check', async () => {
    level = 'hr';
    const { companyAdminAuth } = require(middlewarePath);
    const { res } = await run(companyAdminAuth({ requireFullAccess: true }), makeReq());
    assert.equal(res.statusCode, 403);
    assert.equal(memberCalls, 0);
  });

  it('routes without :userId skip the target check', async () => {
    const { companyAdminAuth } = require(middlewarePath);
    const { nextCalled } = await run(companyAdminAuth(), makeReq({ withTarget: false }));
    assert.equal(nextCalled, true);
    assert.equal(memberCalls, 0);
  });
});
