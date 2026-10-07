const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const ORG_ID = '507f1f77bcf86cd799439011';

const scopePath = require.resolve('../src/services/taskWorkspaceScope');
const accessPath = require.resolve('../src/services/governanceAccess.service');
const servicePath = require.resolve('../src/services/governance.service');
const controllerPath = require.resolve('../src/controllers/governance.controller');

let membershipRole = 'member';
let controller;
let savedScopeEntry;

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function makeReq(query = {}) {
  return { user: { id: 'u1' }, query, body: {}, headers: {} };
}

describe('GET /governance/security-flags admin-only (Sec-Y2b)', () => {
  before(() => {
    const realScope = require(scopePath);
    savedScopeEntry = require.cache[scopePath];
    require.cache[scopePath] = {
      id: scopePath,
      filename: scopePath,
      loaded: true,
      exports: {
        ...realScope,
        fetchTaskWorkspaceScope: async () => ({ membershipRole }),
      },
    };
    for (const p of [accessPath, servicePath, controllerPath]) delete require.cache[p];
    controller = require(controllerPath);
  });

  after(() => {
    require.cache[scopePath] = savedScopeEntry;
    for (const p of [accessPath, servicePath, controllerPath]) delete require.cache[p];
  });

  it('returns 400 VALIDATION_REQUIRED without organizationId', async () => {
    membershipRole = 'admin';
    const res = makeRes();
    await controller.securityFlags(makeReq(), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'VALIDATION_REQUIRED');
  });

  it('returns 403 GOVERNANCE_ADMIN_REQUIRED for a non-admin member', async () => {
    membershipRole = 'member';
    const res = makeRes();
    await controller.securityFlags(makeReq({ organizationId: ORG_ID }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.errorCode, 'GOVERNANCE_ADMIN_REQUIRED');
    assert.equal(res.body.data, undefined);
  });

  it('returns stub flags for org admin / owner', async () => {
    for (const role of ['admin', 'owner']) {
      membershipRole = role;
      const res = makeRes();
      await controller.securityFlags(makeReq({ organizationId: ORG_ID }), res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.deepEqual(Object.keys(res.body.data).sort(), [
        'ipAllowlist',
        'mfa',
        'note',
        'sso',
        'status',
        'wave',
        'webauthn',
      ]);
    }
  });
});
