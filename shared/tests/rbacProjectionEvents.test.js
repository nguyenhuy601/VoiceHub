const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  RBAC_PROJECTION_EVENT_TYPES,
  isKnownRbacProjectionEventType,
  buildRbacProjectionEnvelope,
} = require('../messaging/rbacProjectionEvents');
const {
  orgPermissionSetCacheKey,
  projectPermissionSetCacheKey,
  permissionSetCachePatternForUser,
} = require('../cache/permissionCacheKeys');

describe('rbacProjectionEvents', () => {
  it('knows v1 types', () => {
    assert.equal(
      isKnownRbacProjectionEventType(RBAC_PROJECTION_EVENT_TYPES.MEMBERSHIP_CHANGED),
      true
    );
  });

  it('builds envelope with user scope', () => {
    const env = buildRbacProjectionEnvelope({
      type: RBAC_PROJECTION_EVENT_TYPES.PROJECT_MEMBER_ROLES_CHANGED,
      eventId: 'e2',
      organizationId: 'o1',
      projectId: 'p1',
      userId: 'u1',
      payload: { roleKeys: ['dev'] },
    });
    assert.equal(env.schemaVersion, 1);
    assert.deepEqual(env.payload.roleKeys, ['dev']);
  });
});

describe('permissionCacheKeys', () => {
  it('builds org and project keys', () => {
    assert.equal(orgPermissionSetCacheKey('u1', 'o1'), 'perm:org:o1:user:u1');
    assert.equal(projectPermissionSetCacheKey('u1', 'p1'), 'perm:project:p1:user:u1');
    assert.equal(permissionSetCachePatternForUser('u1'), 'perm:*:user:u1');
  });
});
