const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const ORIG_LOAD = Module._load;
const stubs = {
  workspaceScope: null,
  visibility: null,
  roster: [],
};

function installStubs() {
  Module._load = function patched(request, parent, isMain) {
    if (request.endsWith('/taskWorkspaceScope') || request.includes('taskWorkspaceScope')) {
      return {
        fetchTaskWorkspaceScope: async () => stubs.workspaceScope,
      };
    }
    if (request.endsWith('/orgVisibility.client') || request.includes('orgVisibility.client')) {
      return {
        fetchProjectVisibilityContext: async () => stubs.visibility,
      };
    }
    if (request.endsWith('/orgStructure.client') || request.includes('orgStructure.client')) {
      return {
        fetchDepartmentRoster: async () => stubs.roster,
      };
    }
    return ORIG_LOAD(request, parent, isMain);
  };
}

function uninstallStubs() {
  Module._load = ORIG_LOAD;
  const key = require.resolve('../src/services/userPerformance.service');
  delete require.cache[key];
}

describe('userPerformance assertPerformanceAccess scope', () => {
  beforeEach(() => {
    stubs.workspaceScope = { membershipRole: 'member' };
    stubs.visibility = {
      organizationRoleKeys: [],
      headedDepartmentIds: [],
    };
    stubs.roster = [];
    installStubs();
  });

  afterEach(() => {
    uninstallStubs();
  });

  it('director is org-wide elevated', async () => {
    stubs.visibility.organizationRoleKeys = ['DIRECTOR'];
    const { assertPerformanceAccess } = require('../src/services/userPerformance.service');
    const access = await assertPerformanceAccess({
      organizationId: '507f1f77bcf86cd799439011',
      actorUserId: '507f1f77bcf86cd799439012',
      requireElevated: true,
    });
    assert.equal(access.orgWide, true);
    assert.equal(access.departmentScoped, undefined);
  });

  it('department_manager scoped to headed departments', async () => {
    stubs.visibility.organizationRoleKeys = ['department_manager'];
    stubs.visibility.headedDepartmentIds = ['507f1f77bcf86cd799439021'];
    stubs.roster = [
      {
        _id: '507f1f77bcf86cd799439021',
        headUserId: '507f1f77bcf86cd799439012',
        memberIds: ['507f1f77bcf86cd799439031', '507f1f77bcf86cd799439032'],
      },
    ];
    const { assertPerformanceAccess } = require('../src/services/userPerformance.service');
    const access = await assertPerformanceAccess({
      organizationId: '507f1f77bcf86cd799439011',
      actorUserId: '507f1f77bcf86cd799439012',
      targetUserId: '507f1f77bcf86cd799439031',
      requireElevated: true,
    });
    assert.equal(access.departmentScoped, true);
    assert.deepEqual(access.headedDepartmentIds, ['507f1f77bcf86cd799439021']);
  });

  it('department_manager denied for user outside headed dept', async () => {
    stubs.visibility.organizationRoleKeys = ['DEPARTMENT_MANAGER'];
    stubs.visibility.headedDepartmentIds = ['507f1f77bcf86cd799439021'];
    stubs.roster = [
      {
        _id: '507f1f77bcf86cd799439021',
        memberIds: ['507f1f77bcf86cd799439031'],
      },
    ];
    const { assertPerformanceAccess } = require('../src/services/userPerformance.service');
    await assert.rejects(
      () =>
        assertPerformanceAccess({
          organizationId: '507f1f77bcf86cd799439011',
          actorUserId: '507f1f77bcf86cd799439012',
          targetUserId: '507f1f77bcf86cd799439099',
        }),
      (err) => err.errorCode === 'PERFORMANCE_OUTSIDE_DEPARTMENT' && err.statusCode === 403
    );
  });

  it('member without elevated role is forbidden for list', async () => {
    stubs.visibility.organizationRoleKeys = ['MEMBER'];
    const { assertPerformanceAccess } = require('../src/services/userPerformance.service');
    await assert.rejects(
      () =>
        assertPerformanceAccess({
          organizationId: '507f1f77bcf86cd799439011',
          actorUserId: '507f1f77bcf86cd799439012',
          requireElevated: true,
        }),
      (err) => err.errorCode === 'PERFORMANCE_FORBIDDEN'
    );
  });
});
