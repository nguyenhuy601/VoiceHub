const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { PATHS, setMock, clearMocks, installSharedMock, mockRes } = require('./helpers/userServiceMocks');

const ORG_ID = '64b000000000000000000001';
const ACTOR_ID = '64b0000000000000000000ff';
const TARGET_ID = '64b0000000000000000000aa';

function makeReq({ userId = TARGET_ID, systemRole, withOrg = true, withTarget = true } = {}) {
  return {
    headers: withOrg ? { 'x-organization-id': ORG_ID } : {},
    params: withTarget ? { userId } : {},
    body: {},
    query: {},
    user: { id: ACTOR_ID, ...(systemRole ? { systemRole } : {}) },
  };
}

async function run(req) {
  const { attachCompanyAdminIfPresent } = require(PATHS.companyAdminAuth);
  const res = mockRes();
  let nextCalled = false;
  await attachCompanyAdminIfPresent(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

describe('attachCompanyAdminIfPresent target scope (soft degrade)', () => {
  let level;
  let membership;
  let memberCalls;

  beforeEach(() => {
    clearMocks();
    installSharedMock();
    level = 'full';
    membership = true;
    memberCalls = 0;
    setMock(PATHS.orgMembershipClient, {
      resolveCompanyAdminLevel: async (actor) =>
        String(actor?.systemRole) === 'admin' ? 'system' : level,
      isActiveOrgMember: async () => {
        memberCalls += 1;
        return membership;
      },
    });
  });

  afterEach(clearMocks);

  it('system admin attaches without a membership lookup', async () => {
    membership = false;
    const req = makeReq({ systemRole: 'admin' });
    const { nextCalled } = await run(req);
    assert.equal(nextCalled, true);
    assert.equal(req.companyAdmin.level, 'system');
    assert.equal(memberCalls, 0);
  });

  it('full admin + active member target attaches admin', async () => {
    const req = makeReq();
    await run(req);
    assert.deepEqual(req.companyAdmin, { organizationId: ORG_ID, level: 'full' });
    assert.equal(memberCalls, 1);
  });

  it('full admin + target outside the org does not attach (peer)', async () => {
    membership = false;
    const req = makeReq();
    const { nextCalled, res } = await run(req);
    assert.equal(nextCalled, true);
    assert.equal(req.companyAdmin, undefined);
    assert.equal(res.body, undefined);
  });

  it('full admin + pending/suspended target (org 404) does not attach', async () => {
    membership = false;
    level = 'hr';
    const req = makeReq();
    await run(req);
    assert.equal(req.companyAdmin, undefined);
  });

  it('org-service unavailable does not attach and still calls next()', async () => {
    membership = 'unavailable';
    const req = makeReq();
    const { nextCalled } = await run(req);
    assert.equal(nextCalled, true);
    assert.equal(req.companyAdmin, undefined);
  });

  it('no org header -> next() without any lookup', async () => {
    const req = makeReq({ withOrg: false });
    const { nextCalled } = await run(req);
    assert.equal(nextCalled, true);
    assert.equal(req.companyAdmin, undefined);
    assert.equal(memberCalls, 0);
  });

  it('route without :userId attaches as before', async () => {
    const req = makeReq({ withTarget: false });
    await run(req);
    assert.equal(req.companyAdmin.level, 'full');
    assert.equal(memberCalls, 0);
  });

  it('self target skips the membership lookup', async () => {
    const req = makeReq({ userId: ACTOR_ID });
    await run(req);
    assert.equal(req.companyAdmin.level, 'full');
    assert.equal(memberCalls, 0);
  });

  it('invalid ObjectId target never calls org-service and does not attach', async () => {
    const req = makeReq({ userId: 'not-an-id' });
    await run(req);
    assert.equal(req.companyAdmin, undefined);
    assert.equal(memberCalls, 0);
  });

  it('non-admin actor never attaches', async () => {
    level = null;
    const req = makeReq();
    await run(req);
    assert.equal(req.companyAdmin, undefined);
    assert.equal(memberCalls, 0);
  });
});
