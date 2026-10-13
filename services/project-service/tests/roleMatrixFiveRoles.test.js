/**
 * Wave 1 — SoD matrix smoke (CODE_DEFAULT) for BA / PO / PM / Tech / QA.
 * Assert allow + deny chéo; không dual role-key; FE caps mirror hasPermission.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hasPermission,
  defaultPermissionsForRoleKey,
} = require('../src/utils/project/projectPermissionMatrix');

const FIVE_ROLES = Object.freeze([
  'business_analyst',
  'product_owner',
  'project_manager',
  'technical_lead',
  'qa_engineer',
]);

/**
 * @param {string} roleKey
 * @param {{ allow: string[], deny: string[] }} expect
 */
function assertRoleMatrix(roleKey, expect) {
  const perms = defaultPermissionsForRoleKey(roleKey);
  assert.ok(Array.isArray(perms) && perms.length > 0, `${roleKey}: empty default`);
  assert.ok(hasPermission(perms, 'project:view'), `${roleKey}: missing project:view`);

  for (const key of expect.allow) {
    assert.equal(
      hasPermission(perms, key),
      true,
      `${roleKey} should ALLOW ${key}`
    );
  }
  for (const key of expect.deny) {
    assert.equal(
      hasPermission(perms, key),
      false,
      `${roleKey} should DENY ${key}`
    );
  }
}

describe('roleMatrixFiveRoles (CODE_DEFAULT SoD)', () => {
  it('every focus role has non-empty default with project:view', () => {
    for (const key of FIVE_ROLES) {
      const perms = defaultPermissionsForRoleKey(key);
      assert.ok(perms.length > 0, key);
      assert.ok(perms.includes('project:view'), key);
    }
  });

  it('BA: analysis author + submit; deny Gate1 PO / planning PM / settings update / project:roles', () => {
    assertRoleMatrix('business_analyst', {
      allow: [
        'analysis:view',
        'analysis:artifact_edit',
        'analysis:submit_ba_review',
        'analysis:manage_trace',
        'planning:view',
        'settings:view',
      ],
      deny: [
        'analysis:po_review',
        'analysis:tech_review',
        'planning:pm_review',
        'planning:po_review',
        'planning:cut_baseline',
        'project:roles',
        'settings:update',
        'members:manage',
        'handover:accept',
      ],
    });
  });

  it('PO: Gate1 po_review + project:roles + handover; deny BA submit / PM planning submit', () => {
    assertRoleMatrix('product_owner', {
      allow: [
        'analysis:view',
        'analysis:po_review',
        'analysis:cut_srs',
        'project:roles',
        'planning:po_review',
        'planning:cut_baseline',
        'handover:accept',
        'settings:view',
      ],
      deny: [
        'analysis:submit_ba_review',
        'analysis:document_upload',
        'analysis:tech_review',
        'planning:pm_review',
        'planning:submit_review',
        'planning:artifact_edit',
        'settings:update',
        'members:manage',
      ],
    });
  });

  it('PM: planning submit/pm_review/cut + settings + members; deny Gate1 po_review', () => {
    assertRoleMatrix('project_manager', {
      allow: [
        'planning:view',
        'planning:artifact_edit',
        'planning:submit_review',
        'planning:pm_review',
        'planning:cut_baseline',
        'planning:publish_wbs',
        'settings:view',
        'settings:update',
        'project:roles',
        'members:manage',
        'analysis:cut_srs',
        'delivery_phase:change',
      ],
      deny: [
        'analysis:po_review',
        'analysis:artifact_edit',
        'analysis:submit_ba_review',
        'analysis:tech_review',
        'planning:po_review',
        'handover:accept',
      ],
    });
  });

  it('Tech: tech_review only on analysis/planning; deny BA author + settings:update', () => {
    assertRoleMatrix('technical_lead', {
      allow: [
        'analysis:view',
        'analysis:tech_review',
        'analysis:manage_trace',
        'planning:view',
        'planning:tech_review',
        'task:view',
        'settings:view',
      ],
      deny: [
        'analysis:artifact_edit',
        'analysis:submit_ba_review',
        'analysis:po_review',
        'analysis:document_upload',
        'planning:pm_review',
        'planning:po_review',
        'planning:artifact_edit',
        'settings:update',
        'project:roles',
        'members:manage',
        'handover:accept',
      ],
    });
  });

  it('QA: board/task ops; deny settings:update + analysis author + Gate reviews', () => {
    assertRoleMatrix('qa_engineer', {
      allow: [
        'project:view',
        'task:view',
        'task:drag_to_done',
        'task:create',
        'task:update',
        'bug:create',
        'settings:view',
        'analysis:view',
        'planning:view',
      ],
      deny: [
        'settings:update',
        'project:roles',
        'members:manage',
        'analysis:artifact_edit',
        'analysis:submit_ba_review',
        'analysis:po_review',
        'analysis:tech_review',
        'planning:pm_review',
        'planning:po_review',
        'planning:submit_review',
        'handover:accept',
      ],
    });
  });

  it('SoD cross-deny: no single role holds both BA submit and PO Gate1 approve', () => {
    for (const key of FIVE_ROLES) {
      const perms = defaultPermissionsForRoleKey(key);
      const canSubmitBa = hasPermission(perms, 'analysis:submit_ba_review');
      const canPoReview = hasPermission(perms, 'analysis:po_review');
      assert.equal(
        canSubmitBa && canPoReview,
        false,
        `${key} must not hold both analysis:submit_ba_review and analysis:po_review`
      );
    }
  });

  it('SoD cross-deny: PM does not hold planning:po_review; PO does not hold planning:pm_review', () => {
    const pm = defaultPermissionsForRoleKey('project_manager');
    const po = defaultPermissionsForRoleKey('product_owner');
    assert.equal(hasPermission(pm, 'planning:po_review'), false);
    assert.equal(hasPermission(po, 'planning:pm_review'), false);
  });
});
