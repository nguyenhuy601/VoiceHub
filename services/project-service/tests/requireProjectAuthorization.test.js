const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const accessPath = path.resolve(__dirname, '../src/services/projectAccess.service.js');
const mwPath = path.resolve(__dirname, '../src/middleware/requireProjectAuthorization.js');

function stubAccess(resolveImpl) {
  const real = require(accessPath);
  require.cache[accessPath] = {
    id: accessPath,
    filename: accessPath,
    loaded: true,
    exports: {
      ...real,
      resolveUserProjectPermissions: resolveImpl,
      hasPermission: real.hasPermission,
    },
  };
  delete require.cache[mwPath];
  return require(mwPath);
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

const validProjectId = '507f1f77bcf86cd799439011';

describe('requireProjectAuthorization', () => {
  afterEach(() => {
    delete require.cache[mwPath];
    delete require.cache[accessPath];
  });

  it('allows isOrgAdmin without view perms', async () => {
    const { requireProjectAuthorization } = stubAccess(async () => ({
      isOrgAdmin: true,
      isCreator: false,
      permissions: [],
    }));
    const req = { user: { id: 'u1' }, params: { projectId: validProjectId } };
    const res = mockRes();
    let nextCalled = false;
    await requireProjectAuthorization(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(res.body, null);
  });

  it('allows isCreator without view perms', async () => {
    const { requireProjectAuthorization } = stubAccess(async () => ({
      isOrgAdmin: false,
      isCreator: true,
      permissions: ['members:manage'],
    }));
    const req = { user: { id: 'u1' }, params: { projectId: validProjectId } };
    const res = mockRes();
    let nextCalled = false;
    await requireProjectAuthorization(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  it('allows project:view or task:view', async () => {
    const { requireProjectAuthorization } = stubAccess(async () => ({
      isOrgAdmin: false,
      isCreator: false,
      permissions: ['task:view'],
    }));
    const req = { userContext: { userId: 'u2' }, params: { projectId: validProjectId } };
    const res = mockRes();
    let nextCalled = false;
    await requireProjectAuthorization(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });

  it('denies other-perm-only (no length bypass)', async () => {
    const { requireProjectAuthorization } = stubAccess(async () => ({
      isOrgAdmin: false,
      isCreator: false,
      permissions: ['members:manage', 'settings:edit'],
    }));
    const req = { user: { id: 'u3' }, params: { projectId: validProjectId } };
    const res = mockRes();
    let nextCalled = false;
    await requireProjectAuthorization(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body?.errorCode, 'PROJECT_FORBIDDEN');
    assert.equal(res.body?.success, false);
  });
});

describe('DEFAULT_PERMISSIONS_BY_ROLE_KEY view coverage', () => {
  it('every default role has project:view or task:view', () => {
    const {
      DEFAULT_PERMISSIONS_BY_ROLE_KEY,
      hasPermission,
    } = require('../src/utils/project/projectPermissionMatrix');
    const missing = [];
    for (const [role, perms] of Object.entries(DEFAULT_PERMISSIONS_BY_ROLE_KEY)) {
      if (!hasPermission(perms, 'project:view') && !hasPermission(perms, 'task:view')) {
        missing.push(role);
      }
    }
    assert.deepEqual(missing, []);
  });
});
