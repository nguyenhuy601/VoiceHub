const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  canTransitionArtifactStatus,
  permissionForArtifactTransition,
  normalizeArtifactKind,
  ARTIFACT_STATUS_TRANSITIONS,
} = require('../src/constants/analysisArtifact');
const {
  defaultPermissionsForRoleKey,
  hasPermission,
  PROJECT_PERMISSION_KEYS,
} = require('../src/utils/project/projectPermissionMatrix');

describe('analysisArtifactLifecycle', () => {
  it('normalizes kinds', () => {
    assert.equal(normalizeArtifactKind('fr'), 'FR');
    assert.equal(normalizeArtifactKind('nope'), null);
  });

  it('enforces draft → ba_review → tech → po → approved', () => {
    assert.equal(canTransitionArtifactStatus('draft', 'ba_review'), true);
    assert.equal(canTransitionArtifactStatus('ba_review', 'tech_review'), true);
    assert.equal(canTransitionArtifactStatus('tech_review', 'po_review'), true);
    assert.equal(canTransitionArtifactStatus('po_review', 'approved'), true);
    assert.equal(canTransitionArtifactStatus('approved', 'draft'), false);
    assert.deepEqual(ARTIFACT_STATUS_TRANSITIONS.approved, []);
  });

  it('maps transitions to analysis permissions', () => {
    assert.equal(
      permissionForArtifactTransition('draft', 'ba_review'),
      'analysis:submit_ba_review'
    );
    assert.equal(
      permissionForArtifactTransition('ba_review', 'tech_review'),
      'analysis:ba_review'
    );
    assert.equal(
      permissionForArtifactTransition('tech_review', 'po_review'),
      'analysis:tech_review'
    );
    assert.equal(
      permissionForArtifactTransition('po_review', 'approved'),
      'analysis:po_review'
    );
  });
});

describe('analysis permission matrix by projectRole', () => {
  it('registers analysis permission keys', () => {
    assert.ok(PROJECT_PERMISSION_KEYS.includes('analysis:view'));
    assert.ok(PROJECT_PERMISSION_KEYS.includes('delivery_phase:change'));
  });

  it('BA can import and ba_review', () => {
    const perms = defaultPermissionsForRoleKey('business_analyst');
    assert.equal(hasPermission(perms, 'analysis:artifact_import'), true);
    assert.equal(hasPermission(perms, 'analysis:ba_review'), true);
    assert.equal(hasPermission(perms, 'analysis:po_review'), false);
    assert.equal(hasPermission(perms, 'delivery_phase:change'), false);
  });

  it('PO can po_review and cut_srs', () => {
    const perms = defaultPermissionsForRoleKey('product_owner');
    assert.equal(hasPermission(perms, 'analysis:po_review'), true);
    assert.equal(hasPermission(perms, 'analysis:cut_srs'), true);
    assert.equal(hasPermission(perms, 'analysis:tech_review'), false);
  });

  it('PM can change delivery phase', () => {
    const perms = defaultPermissionsForRoleKey('project_manager');
    assert.equal(hasPermission(perms, 'delivery_phase:change'), true);
    assert.equal(hasPermission(perms, 'analysis:cut_srs'), true);
  });

  it('Tech lead can tech_review', () => {
    const perms = defaultPermissionsForRoleKey('technical_lead');
    assert.equal(hasPermission(perms, 'analysis:tech_review'), true);
    assert.equal(hasPermission(perms, 'analysis:ba_review'), false);
  });

  it('legacy tech_lead alias resolves', () => {
    const perms = defaultPermissionsForRoleKey('tech_lead');
    assert.equal(hasPermission(perms, 'analysis:tech_review'), true);
  });
});
