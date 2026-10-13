/**
 * analysisAuthorKinds — mirror assertCanAuthorKind; every MASTER role bucket §1.5.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MASTER_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/masterData');
const {
  defaultPermissionsForRoleKey,
} = require('../src/utils/project/projectPermissionMatrix');
const {
  ANALYSIS_AUTHOR_KINDS_ALL,
  PO_AUTHOR_KINDS,
  resolveAnalysisAuthorKinds,
  isAnalysisKindAllowed,
  canAuthorAnalysisKind,
} = require('../src/utils/project/analysisAuthorKinds');

describe('analysisAuthorKinds', () => {
  it('bypass → *', () => {
    assert.equal(resolveAnalysisAuthorKinds([], { bypass: true }), ANALYSIS_AUTHOR_KINDS_ALL);
  });

  it('BA → * and can author FR', () => {
    const perms = defaultPermissionsForRoleKey('business_analyst');
    assert.equal(resolveAnalysisAuthorKinds(perms), ANALYSIS_AUTHOR_KINDS_ALL);
    assert.equal(canAuthorAnalysisKind(perms, 'FR'), true);
    assert.equal(canAuthorAnalysisKind(perms, 'BG'), true);
  });

  it('PO → BG/SCOPE only', () => {
    const perms = defaultPermissionsForRoleKey('product_owner');
    const kinds = resolveAnalysisAuthorKinds(perms);
    assert.deepEqual(kinds, [...PO_AUTHOR_KINDS]);
    assert.equal(canAuthorAnalysisKind(perms, 'BG'), true);
    assert.equal(canAuthorAnalysisKind(perms, 'SCOPE'), true);
    assert.equal(canAuthorAnalysisKind(perms, 'FR'), false);
    assert.equal(canAuthorAnalysisKind(perms, 'UC'), false);
  });

  it('PM / Tech / Dev / QA / UI-UX / Observer → []', () => {
    for (const key of [
      'project_manager',
      'technical_lead',
      'solution_architect',
      'backend_developer',
      'qa_engineer',
      'ui_ux_designer',
      'scrum_master',
      'observer',
    ]) {
      assert.deepEqual(
        resolveAnalysisAuthorKinds(defaultPermissionsForRoleKey(key)),
        [],
        key
      );
    }
  });

  it('every MASTER_PROJECT_ROLE_KEYS matches §1.5 author bucket', () => {
    /** @type {Record<string, '*'|string[]>} */
    const expected = {
      business_analyst: ANALYSIS_AUTHOR_KINDS_ALL,
      product_owner: [...PO_AUTHOR_KINDS],
      project_manager: [],
      technical_lead: [],
      solution_architect: [],
      scrum_master: [],
      backend_developer: [],
      frontend_developer: [],
      mobile_developer: [],
      fullstack_developer: [],
      qa_lead: [],
      qa_engineer: [],
      ui_ux_designer: [],
      devops_engineer: [],
      sponsor: [],
      stakeholder: [],
      observer: [],
    };
    assert.ok(Array.isArray(MASTER_PROJECT_ROLE_KEYS) && MASTER_PROJECT_ROLE_KEYS.length > 0);
    for (const key of MASTER_PROJECT_ROLE_KEYS) {
      const got = resolveAnalysisAuthorKinds(defaultPermissionsForRoleKey(key));
      const want = expected[key];
      assert.ok(want !== undefined, `missing expected for ${key}`);
      if (want === ANALYSIS_AUTHOR_KINDS_ALL) {
        assert.equal(got, ANALYSIS_AUTHOR_KINDS_ALL, key);
      } else {
        assert.deepEqual(got, want, key);
      }
    }
  });

  it('isAnalysisKindAllowed helpers', () => {
    assert.equal(isAnalysisKindAllowed('*', 'FR'), true);
    assert.equal(isAnalysisKindAllowed(['BG', 'SCOPE'], 'BG'), true);
    assert.equal(isAnalysisKindAllowed(['BG', 'SCOPE'], 'FR'), false);
    assert.equal(isAnalysisKindAllowed([], 'BG'), false);
  });

  it('project:edit alone does not grant author kinds', () => {
    assert.deepEqual(
      resolveAnalysisAuthorKinds(['project:view', 'project:edit', 'analysis:view']),
      []
    );
  });
});
