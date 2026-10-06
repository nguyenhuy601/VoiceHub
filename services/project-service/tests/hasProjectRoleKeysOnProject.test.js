/**
 * Unit — hasProjectRoleKeysOnProject resolves via membership → role key
 * (org catalog or project clone), not ProjectRole.projectId filter.
 */

const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

describe('hasProjectRoleKeysOnProject', () => {
  let hasProjectRoleKeysOnProject;
  let ProjectMembership;
  let ProjectRole;
  let membershipFind;
  let roleFind;

  before(() => {
    // Force "connected" so helper does not short-circuit
    Object.defineProperty(mongoose.connection, 'readyState', {
      configurable: true,
      get: () => 1,
    });

    ProjectMembership = require('../src/models/ProjectMembership');
    ProjectRole = require('../src/models/ProjectRole');
    membershipFind = mock.method(ProjectMembership, 'find', () => ({
      select: () => ({
        lean: async () => [{ projectRoleId: 'role-org-po' }],
      }),
    }));
    roleFind = mock.method(ProjectRole, 'find', () => ({
      select: () => ({
        lean: async () => [{ _id: 'role-org-po', key: 'product_owner' }],
      }),
    }));

    ({ hasProjectRoleKeysOnProject } = require('../src/utils/requirement/resolveRequirementPersona'));
  });

  after(() => {
    membershipFind.mock.restore();
    roleFind.mock.restore();
  });

  it('grants when membership points at org-catalog product_owner (projectId null on role)', async () => {
    // Simulate ObjectId-like strings (24 hex)
    const uid = '507f1f77bcf86cd799439011';
    const pid = '507f1f77bcf86cd799439022';
    const ok = await hasProjectRoleKeysOnProject(uid, pid, ['product_owner', 'project_manager']);
    assert.equal(ok, true);
    assert.equal(membershipFind.mock.callCount() >= 1, true);
    // Must NOT query ProjectRole by projectId — only by membership role ids
    const roleQuery = roleFind.mock.calls[0]?.arguments?.[0] || {};
    assert.equal(Object.prototype.hasOwnProperty.call(roleQuery, 'projectId'), false);
    assert.ok(roleQuery._id);
  });
});
