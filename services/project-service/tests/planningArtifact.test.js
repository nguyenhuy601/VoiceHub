const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  canTransitionPlanningStatus,
  permissionForPlanningTransition,
  normalizePlanningKind,
  isPlanningContentEditableStatus,
  isPlanningReviewNoteRequired,
  canResubmitPlanningFromChangesRequested,
  PLANNING_ARTIFACT_KINDS,
} = require('../src/constants/planningArtifact');
const {
  defaultPermissionsForRoleKey,
  hasPermission,
  PROJECT_PERMISSION_KEYS,
} = require('../src/utils/project/projectPermissionMatrix');

describe('planningArtifact lifecycle', () => {
  it('normalizes kinds', () => {
    assert.equal(normalizePlanningKind('wbs'), 'WBS');
    assert.equal(normalizePlanningKind('nope'), null);
    assert.ok(PLANNING_ARTIFACT_KINDS.includes('RISK'));
  });

  it('enforces DEC D9 draft → pm → [tech] → po → approved', () => {
    assert.equal(canTransitionPlanningStatus('draft', 'pm_review'), true);
    assert.equal(canTransitionPlanningStatus('pm_review', 'tech_review'), true);
    assert.equal(canTransitionPlanningStatus('tech_review', 'po_review'), true);
    assert.equal(canTransitionPlanningStatus('pm_review', 'po_review'), true);
    assert.equal(canTransitionPlanningStatus('po_review', 'approved'), true);
    assert.equal(canTransitionPlanningStatus('approved', 'draft'), false);
  });

  it('supports changes_requested with resubmit to same gate', () => {
    assert.equal(canTransitionPlanningStatus('pm_review', 'changes_requested'), true);
    assert.equal(canTransitionPlanningStatus('tech_review', 'changes_requested'), true);
    assert.equal(canTransitionPlanningStatus('po_review', 'changes_requested'), true);
    assert.equal(canTransitionPlanningStatus('changes_requested', 'pm_review'), true);
    assert.equal(
      canResubmitPlanningFromChangesRequested('changes_requested', 'pm_review', 'pm_review'),
      true
    );
    assert.equal(
      canResubmitPlanningFromChangesRequested('changes_requested', 'po_review', 'pm_review'),
      false
    );
    assert.equal(isPlanningReviewNoteRequired('changes_requested'), true);
    assert.equal(isPlanningContentEditableStatus('changes_requested'), true);
  });

  it('maps transitions to planning permissions', () => {
    assert.equal(permissionForPlanningTransition('draft', 'pm_review'), 'planning:submit_review');
    assert.equal(
      permissionForPlanningTransition('pm_review', 'changes_requested'),
      'planning:pm_review'
    );
    assert.equal(permissionForPlanningTransition('po_review', 'approved'), 'planning:po_review');
  });
});

describe('planning permissions in matrix (DEC D9 ownership)', () => {
  it('registers planning keys', () => {
    assert.ok(PROJECT_PERMISSION_KEYS.includes('planning:view'));
    assert.ok(PROJECT_PERMISSION_KEYS.includes('planning:cut_baseline'));
  });

  it('PM owns edit + pm_review + cut/publish; no analysis:po_review', () => {
    const perms = defaultPermissionsForRoleKey('project_manager');
    assert.equal(hasPermission(perms, 'planning:artifact_edit'), true);
    assert.equal(hasPermission(perms, 'planning:pm_review'), true);
    assert.equal(hasPermission(perms, 'planning:cut_baseline'), true);
    assert.equal(hasPermission(perms, 'planning:publish_wbs'), true);
    assert.equal(hasPermission(perms, 'analysis:po_review'), false);
  });

  it('BA has planning view only — no ba_review / no edit', () => {
    const perms = defaultPermissionsForRoleKey('business_analyst');
    assert.equal(hasPermission(perms, 'planning:view'), true);
    assert.equal(hasPermission(perms, 'planning:ba_review'), false);
    assert.equal(hasPermission(perms, 'planning:artifact_edit'), false);
    assert.equal(hasPermission(perms, 'planning:cut_baseline'), false);
  });

  it('PO accepts plan — po_review + cut, no artifact_edit', () => {
    const perms = defaultPermissionsForRoleKey('product_owner');
    assert.equal(hasPermission(perms, 'planning:po_review'), true);
    assert.equal(hasPermission(perms, 'planning:cut_baseline'), true);
    assert.equal(hasPermission(perms, 'planning:artifact_edit'), false);
  });

  it('Tech reviews only — no planning artifact_edit', () => {
    const perms = defaultPermissionsForRoleKey('technical_lead');
    assert.equal(hasPermission(perms, 'planning:tech_review'), true);
    assert.equal(hasPermission(perms, 'planning:artifact_edit'), false);
  });
});
