const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyAudiences,
  resolveProjectAccess,
  normalizeProjectVisibilityPolicy,
  canUseCustomProjectVisibility,
  assertCanUseCustomProjectVisibility,
} = require('../src/utils/projectVisibility');

describe('projectVisibility resolve', () => {
  const orgPolicy = normalizeProjectVisibilityPolicy({
    discoverAudiences: {
      related_department_members: false,
      related_department_managers: true,
      project_members: true,
      all_employees: false,
    },
    defaultInformationLevels: {
      related_department_managers: 'summary',
      project_members: 'details',
    },
  });

  it('T2: related member + discover off → no discover', () => {
    const access = resolveProjectAccess({
      actor: {
        userId: 'u1',
        isOrgMember: true,
        membershipRole: 'member',
        organizationRoleKeys: [],
        headedDepartmentIds: [],
        memberDepartmentIds: ['d1'],
      },
      project: {
        createdBy: 'other',
        relatedDepartmentIds: ['d1'],
        visibilityMode: 'inherit',
        visibility: 'private',
      },
      membership: { isMember: false, projectRoleKeys: [] },
      orgPolicy,
    });
    assert.equal(access.discover, false);
  });

  it('T3: related dept manager on → summary', () => {
    const access = resolveProjectAccess({
      actor: {
        userId: 'u2',
        isOrgMember: true,
        membershipRole: 'member',
        organizationRoleKeys: [],
        headedDepartmentIds: ['d1'],
        memberDepartmentIds: ['d1'],
      },
      project: {
        createdBy: 'other',
        relatedDepartmentIds: ['d1'],
        visibilityMode: 'inherit',
        visibility: 'private',
      },
      membership: { isMember: false, projectRoleKeys: [] },
      orgPolicy,
    });
    assert.equal(access.discover, true);
    assert.equal(access.informationLevel, 'summary');
    assert.ok(access.audiences.includes('related_department_managers'));
  });

  it('project member + related dept manager → details (not stuck at summary)', () => {
    const access = resolveProjectAccess({
      actor: {
        userId: 'u4',
        isOrgMember: true,
        membershipRole: 'member',
        organizationRoleKeys: [],
        headedDepartmentIds: ['d1'],
        memberDepartmentIds: ['d1'],
      },
      project: {
        createdBy: 'other',
        relatedDepartmentIds: ['d1'],
        visibilityMode: 'inherit',
        visibility: 'private',
      },
      membership: { isMember: true, projectRoleKeys: ['developer'] },
      orgPolicy,
    });
    assert.equal(access.discover, true);
    assert.equal(access.informationLevel, 'details');
    assert.ok(access.audiences.includes('project_members'));
  });

  it('creator gets at least project_managers confidential floor', () => {
    const access = resolveProjectAccess({
      actor: {
        userId: 'creator1',
        isOrgMember: true,
        membershipRole: 'member',
        organizationRoleKeys: [],
        headedDepartmentIds: ['d1'],
        memberDepartmentIds: ['d1'],
      },
      project: {
        createdBy: 'creator1',
        relatedDepartmentIds: ['d1'],
        visibilityMode: 'inherit',
        visibility: 'private',
      },
      membership: { isMember: true, projectRoleKeys: [] },
      orgPolicy,
    });
    assert.equal(access.informationLevel, 'confidential');
  });

  it('classify: owner is system_admins + organization_admins', () => {
    const audiences = classifyAudiences(
      { userId: 'o1', membershipRole: 'owner', isOrgMember: true, organizationRoleKeys: [] },
      { createdBy: 'o1' },
      { isMember: true, projectRoleKeys: ['product_owner'] }
    );
    assert.ok(audiences.includes('system_admins'));
    assert.ok(audiences.includes('organization_admins'));
    assert.ok(audiences.includes('project_managers'));
  });

  it('custom override levels apply', () => {
    const access = resolveProjectAccess({
      actor: {
        userId: 'u3',
        isOrgMember: true,
        membershipRole: 'member',
        headedDepartmentIds: ['d1'],
        memberDepartmentIds: ['d1'],
        organizationRoleKeys: [],
      },
      project: {
        createdBy: 'other',
        relatedDepartmentIds: ['d1'],
        visibilityMode: 'custom',
        visibilityPolicy: normalizeProjectVisibilityPolicy({
          discoverAudiences: { related_department_managers: true },
          defaultInformationLevels: { related_department_managers: 'details' },
        }),
        informationLevelOverrides: [
          { audience: 'related_department_managers', level: 'confidential' },
        ],
        visibility: 'private',
      },
      membership: { isMember: false, projectRoleKeys: [] },
      orgPolicy,
    });
    assert.equal(access.discover, true);
    assert.equal(access.informationLevel, 'confidential');
  });

  it('T4: override blocked when allowProjectManagerOverride=false for non-admin', () => {
    const ctx = {
      membershipRole: 'member',
      policy: normalizeProjectVisibilityPolicy({ allowProjectManagerOverride: false }),
    };
    assert.equal(canUseCustomProjectVisibility(ctx, 'u1').allowed, false);
    assert.throws(
      () => assertCanUseCustomProjectVisibility(ctx, 'u1'),
      (err) => err.statusCode === 403
    );
  });

  it('T4b: org admin may override when allowProjectManagerOverride=false', () => {
    const ctx = {
      membershipRole: 'admin',
      policy: normalizeProjectVisibilityPolicy({ allowProjectManagerOverride: false }),
    };
    assert.equal(canUseCustomProjectVisibility(ctx, 'admin1').allowed, true);
    assert.doesNotThrow(() => assertCanUseCustomProjectVisibility(ctx, 'admin1'));
  });
});
