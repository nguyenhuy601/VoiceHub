const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  canTransitionPlanningStatus,
  permissionForPlanningTransition,
  normalizePlanningKind,
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

  it('enforces draft → ba → tech → pm → po → approved', () => {
    assert.equal(canTransitionPlanningStatus('draft', 'ba_review'), true);
    assert.equal(canTransitionPlanningStatus('ba_review', 'tech_review'), true);
    assert.equal(canTransitionPlanningStatus('tech_review', 'pm_review'), true);
    assert.equal(canTransitionPlanningStatus('pm_review', 'po_review'), true);
    assert.equal(canTransitionPlanningStatus('po_review', 'approved'), true);
    assert.equal(canTransitionPlanningStatus('approved', 'draft'), false);
  });

  it('maps transitions to planning permissions', () => {
    assert.equal(permissionForPlanningTransition('draft', 'ba_review'), 'planning:submit_review');
    assert.equal(permissionForPlanningTransition('po_review', 'approved'), 'planning:po_review');
  });
});

describe('planning permissions in matrix', () => {
  it('registers planning keys', () => {
    assert.ok(PROJECT_PERMISSION_KEYS.includes('planning:view'));
    assert.ok(PROJECT_PERMISSION_KEYS.includes('planning:cut_baseline'));
  });

  it('PM can cut baseline and publish wbs', () => {
    const perms = defaultPermissionsForRoleKey('project_manager');
    assert.equal(hasPermission(perms, 'planning:cut_baseline'), true);
    assert.equal(hasPermission(perms, 'planning:publish_wbs'), true);
  });

  it('BA can ba_review planning', () => {
    const perms = defaultPermissionsForRoleKey('business_analyst');
    assert.equal(hasPermission(perms, 'planning:ba_review'), true);
    assert.equal(hasPermission(perms, 'planning:cut_baseline'), false);
  });
});
