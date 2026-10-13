/**
 * Wave 3 — Planning / Board / Members capability flags (mirror attachProjectCapabilities).
 * Không đổi CODE_DEFAULT; assert 1:1 key → flag; không dual project:edit.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MASTER_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/masterData');
const {
  hasPermission,
  defaultPermissionsForRoleKey,
} = require('../src/utils/project/projectPermissionMatrix');

/** Mirror attachProjectCapabilities planning + members flags (non-bypass). */
function planningMembersFlagsFromPermissions(permissions = [], { bypass = false } = {}) {
  const matrixHas = (key) => hasPermission(permissions, key);
  const unionHas = matrixHas;
  return {
    canViewPlanning: bypass || matrixHas('planning:view'),
    canEditPlanning: matrixHas('planning:artifact_edit'),
    canSubmitPlanning: matrixHas('planning:submit_review'),
    canReviewPlanningPm: matrixHas('planning:pm_review'),
    canReviewPlanningTech: matrixHas('planning:tech_review'),
    canReviewPlanningPo: matrixHas('planning:po_review'),
    canCutPlanningBaseline: matrixHas('planning:cut_baseline'),
    canPublishPlanningWbs: matrixHas('planning:publish_wbs'),
    canViewMembers: bypass || unionHas('members:view'),
    canManageMembers: unionHas('members:manage'),
  };
}

/** Hub FE fallback: flag missing → permissions.includes (không OR board:admin). */
function resolveCanManageMembersHub(caps) {
  const permissions = Array.isArray(caps?.permissions) ? caps.permissions : [];
  if (caps?.canManageMembers != null) return Boolean(caps.canManageMembers);
  return permissions.includes('members:manage');
}

describe('planningBoardMembersCaps', () => {
  it('canSubmitPlanning mirrors planning:submit_review only', () => {
    const withSubmit = planningMembersFlagsFromPermissions([
      'planning:view',
      'planning:submit_review',
    ]);
    assert.equal(withSubmit.canSubmitPlanning, true);
    assert.equal(withSubmit.canEditPlanning, false);

    const editOnly = planningMembersFlagsFromPermissions([
      'planning:view',
      'planning:artifact_edit',
    ]);
    assert.equal(editOnly.canSubmitPlanning, false);
    assert.equal(editOnly.canEditPlanning, true);

    const reviewOnly = planningMembersFlagsFromPermissions([
      'planning:view',
      'planning:pm_review',
    ]);
    assert.equal(reviewOnly.canSubmitPlanning, false);
    assert.equal(reviewOnly.canReviewPlanningPm, true);
  });

  it('Publish ≠ Cut: publish_wbs vs cut_baseline', () => {
    const cutOnly = planningMembersFlagsFromPermissions([
      'planning:view',
      'planning:cut_baseline',
    ]);
    assert.equal(cutOnly.canCutPlanningBaseline, true);
    assert.equal(cutOnly.canPublishPlanningWbs, false);

    const both = planningMembersFlagsFromPermissions([
      'planning:view',
      'planning:cut_baseline',
      'planning:publish_wbs',
    ]);
    assert.equal(both.canCutPlanningBaseline, true);
    assert.equal(both.canPublishPlanningWbs, true);
  });

  it('members:manage enables canManageMembers; board:admin does not', () => {
    const manage = planningMembersFlagsFromPermissions(['members:view', 'members:manage']);
    assert.equal(manage.canManageMembers, true);
    assert.equal(manage.canViewMembers, true);

    const viewOnly = planningMembersFlagsFromPermissions(['members:view']);
    assert.equal(viewOnly.canManageMembers, false);
    assert.equal(viewOnly.canViewMembers, true);

    assert.equal(
      resolveCanManageMembersHub({ permissions: ['board:admin'], canManageMembers: undefined }),
      false
    );
    assert.equal(
      resolveCanManageMembersHub({
        permissions: ['members:manage'],
        canManageMembers: undefined,
      }),
      true
    );
    assert.equal(
      resolveCanManageMembersHub({
        permissions: ['members:manage'],
        canManageMembers: false,
      }),
      false
    );
  });

  it('project:edit alone does not grant submit/publish/members manage', () => {
    const flags = planningMembersFlagsFromPermissions([
      'project:view',
      'project:edit',
      'planning:view',
      'members:view',
    ]);
    assert.equal(flags.canSubmitPlanning, false);
    assert.equal(flags.canPublishPlanningWbs, false);
    assert.equal(flags.canManageMembers, false);
  });

  it('§1.5 CODE_DEFAULT — PM / PO / BA planning + members', () => {
    const pm = planningMembersFlagsFromPermissions(
      defaultPermissionsForRoleKey('project_manager')
    );
    assert.equal(pm.canEditPlanning, true);
    assert.equal(pm.canSubmitPlanning, true);
    assert.equal(pm.canReviewPlanningPm, true);
    assert.equal(pm.canCutPlanningBaseline, true);
    assert.equal(pm.canPublishPlanningWbs, true);
    assert.equal(pm.canManageMembers, true);
    assert.equal(pm.canViewMembers, true);

    const po = planningMembersFlagsFromPermissions(
      defaultPermissionsForRoleKey('product_owner')
    );
    assert.equal(po.canEditPlanning, false);
    assert.equal(po.canSubmitPlanning, false);
    assert.equal(po.canReviewPlanningPo, true);
    assert.equal(po.canCutPlanningBaseline, true);
    assert.equal(po.canPublishPlanningWbs, false);
    assert.equal(po.canManageMembers, false);
    assert.equal(po.canViewMembers, true);

    const ba = planningMembersFlagsFromPermissions(
      defaultPermissionsForRoleKey('business_analyst')
    );
    assert.equal(ba.canViewPlanning, true);
    assert.equal(ba.canEditPlanning, false);
    assert.equal(ba.canSubmitPlanning, false);
    assert.equal(ba.canPublishPlanningWbs, false);
    assert.equal(ba.canManageMembers, false);
    assert.equal(ba.canViewMembers, true);
  });

  it('every MASTER_PROJECT_ROLE_KEYS: no project:edit dual for submit/publish/members', () => {
    assert.ok(Array.isArray(MASTER_PROJECT_ROLE_KEYS) && MASTER_PROJECT_ROLE_KEYS.length > 0);
    for (const key of MASTER_PROJECT_ROLE_KEYS) {
      const perms = defaultPermissionsForRoleKey(key);
      assert.ok(Array.isArray(perms) && perms.length > 0, `empty default for ${key}`);
      if (perms.includes('project:edit')) {
        const flags = planningMembersFlagsFromPermissions(perms);
        if (!perms.includes('planning:submit_review')) {
          assert.equal(flags.canSubmitPlanning, false, `submit dual ${key}`);
        }
        if (!perms.includes('planning:publish_wbs')) {
          assert.equal(flags.canPublishPlanningWbs, false, `publish dual ${key}`);
        }
        if (!perms.includes('members:manage')) {
          assert.equal(flags.canManageMembers, false, `members dual ${key}`);
        }
      }
    }
  });
});
