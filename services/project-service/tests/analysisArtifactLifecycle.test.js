const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  canTransitionArtifactStatus,
  canResubmitFromChangesRequested,
  permissionForArtifactTransition,
  isArtifactContentEditableStatus,
  isReviewNoteRequired,
  normalizeArtifactKind,
  ARTIFACT_STATUS_TRANSITIONS,
} = require('../src/constants/analysisArtifact');
const {
  defaultPermissionsForRoleKey,
  hasPermission,
  unionPermissionsFromRoles,
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

  it('supports changes_requested without returning to draft', () => {
    assert.equal(canTransitionArtifactStatus('tech_review', 'changes_requested'), true);
    assert.equal(canTransitionArtifactStatus('po_review', 'changes_requested'), true);
    assert.equal(canTransitionArtifactStatus('rejected', 'draft'), false);
    assert.deepEqual(ARTIFACT_STATUS_TRANSITIONS.rejected, []);
    assert.equal(canTransitionArtifactStatus('changes_requested', 'tech_review'), true);
  });

  it('resubmit only to the gate that requested changes', () => {
    assert.equal(canResubmitFromChangesRequested('changes_requested', 'tech_review', 'tech_review'), true);
    assert.equal(canResubmitFromChangesRequested('changes_requested', 'po_review', 'tech_review'), false);
    assert.equal(canResubmitFromChangesRequested('changes_requested', 'tech_review', ''), true);
  });

  it('requires note for changes_requested and rejected', () => {
    assert.equal(isReviewNoteRequired('changes_requested'), true);
    assert.equal(isReviewNoteRequired('rejected'), true);
    assert.equal(isReviewNoteRequired('approved'), false);
  });

  it('content editable only draft and changes_requested', () => {
    assert.equal(isArtifactContentEditableStatus('draft'), true);
    assert.equal(isArtifactContentEditableStatus('changes_requested'), true);
    assert.equal(isArtifactContentEditableStatus('rejected'), false);
    assert.equal(isArtifactContentEditableStatus('ba_review'), false);
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

  it('PO can po_review and cut_srs — không upload Raw/Analysis', () => {
    const perms = defaultPermissionsForRoleKey('product_owner');
    assert.equal(hasPermission(perms, 'analysis:po_review'), true);
    assert.equal(hasPermission(perms, 'analysis:cut_srs'), true);
    assert.equal(hasPermission(perms, 'analysis:tech_review'), false);
    assert.equal(hasPermission(perms, 'analysis:document_upload'), false);
    assert.equal(hasPermission(perms, 'analysis:artifact_import'), false);
    assert.equal(hasPermission(perms, 'analysis:artifact_edit'), true);
  });

  it('PM can change delivery phase — không upload Raw/Analysis; không đứng cổng PO', () => {
    const perms = defaultPermissionsForRoleKey('project_manager');
    assert.equal(hasPermission(perms, 'delivery_phase:change'), true);
    assert.equal(hasPermission(perms, 'analysis:cut_srs'), true);
    assert.equal(hasPermission(perms, 'analysis:po_review'), false);
    assert.equal(hasPermission(perms, 'analysis:document_upload'), false);
    assert.equal(hasPermission(perms, 'analysis:artifact_import'), false);
  });

  it('matrixPermissionsFromRoleKeys ignores stale doc import perms on PM/PO', () => {
    const {
      matrixPermissionsFromRoleKeys,
      unionPermissionsFromRoles,
    } = require('../src/utils/project/projectPermissionMatrix');
    const stalePm = {
      key: 'project_manager',
      permissions: ['analysis:document_upload', 'analysis:artifact_import', 'analysis:ba_review'],
    };
    const matrixOnly = matrixPermissionsFromRoleKeys([stalePm]);
    assert.equal(hasPermission(matrixOnly, 'analysis:document_upload'), false);
    assert.equal(hasPermission(matrixOnly, 'analysis:artifact_import'), false);
    // union still additive (legacy) — nên import gate KHÔNG dùng union
    const unioned = unionPermissionsFromRoles([stalePm]);
    assert.equal(hasPermission(unioned, 'analysis:document_upload'), true);
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

  it('stale PO/BA docs still get analysis:view from role-key matrix', () => {
    const perms = unionPermissionsFromRoles([
      { key: 'product_owner', permissions: ['project:view'] },
      { key: 'business_analyst', permissions: ['project:view', 'task:view'] },
    ]);
    assert.equal(hasPermission(perms, 'analysis:view'), true);
    assert.equal(hasPermission(perms, 'analysis:artifact_edit'), true);
    assert.equal(hasPermission(perms, 'analysis:ba_review'), true);
    assert.equal(hasPermission(perms, 'analysis:po_review'), true);
    assert.equal(hasPermission(perms, 'planning:view'), true);
  });

  it('empty roles yield no analysis:view', () => {
    const perms = unionPermissionsFromRoles([]);
    assert.equal(hasPermission(perms, 'analysis:view'), false);
  });

  it('doc permissions remain additive on top of role-key baseline', () => {
    const perms = unionPermissionsFromRoles([
      {
        key: 'scrum_master',
        permissions: ['project:view', 'analysis:cut_srs'],
      },
    ]);
    // SM baseline (VIEW_ONLY) includes analysis:view; cut_srs only from doc
    assert.equal(hasPermission(perms, 'analysis:view'), true);
    assert.equal(hasPermission(perms, 'sprint:create'), true);
    assert.equal(hasPermission(perms, 'analysis:cut_srs'), true);
  });
});
