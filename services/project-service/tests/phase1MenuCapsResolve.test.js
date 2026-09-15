/**
 * Phase 1 RA menu caps — membership hard-floor + orphan VIEW_ONLY baseline.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveProjectAccess,
} = require('../src/utils/project/projectVisibility');
const {
  VIEW_ONLY,
  hasPermission,
  applyInformationLevelToPermissions,
  normalizePermissionList,
} = require('../src/utils/project/projectPermissionMatrix');

describe('phase1MenuCapsResolve', () => {
  it('hard-floors project members to details even when policy sets project_members summary', () => {
    const access = resolveProjectAccess({
      actor: {
        userId: 'u1',
        isOrgMember: true,
        membershipRole: 'member',
        organizationRoleKeys: [],
        headedDepartmentIds: [],
        memberDepartmentIds: [],
      },
      project: { createdBy: 'other', visibility: 'workspace' },
      membership: {
        isMember: true,
        projectRoleKeys: ['business_analyst'],
      },
      orgPolicy: {
        discoverAudiences: {
          project_members: true,
          all_employees: true,
        },
        defaultInformationLevels: {
          project_members: 'summary',
          all_employees: 'summary',
        },
      },
    });
    assert.equal(access.informationLevel, 'details');
    const perms = applyInformationLevelToPermissions(
      normalizePermissionList(VIEW_ONLY),
      access.informationLevel
    );
    assert.equal(hasPermission(perms, 'analysis:view'), true);
    assert.equal(hasPermission(perms, 'planning:view'), true);
  });

  it('orphan membership baseline VIEW_ONLY keeps analysis:view after details floor', () => {
    const perms = applyInformationLevelToPermissions(
      normalizePermissionList(VIEW_ONLY),
      'details'
    );
    assert.equal(hasPermission(perms, 'analysis:view'), true);
    assert.equal(hasPermission(perms, 'planning:view'), true);
  });

  it('summary still strips analysis:view for non-members', () => {
    const perms = applyInformationLevelToPermissions(
      normalizePermissionList(VIEW_ONLY),
      'summary'
    );
    assert.equal(hasPermission(perms, 'analysis:view'), false);
    assert.equal(hasPermission(perms, 'project:view'), true);
  });
});
