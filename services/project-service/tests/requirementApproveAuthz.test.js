/**
 * Unit — evaluateApproverFromProjectRoles (FE SoT for Gate1 approve)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateApproverFromProjectRoles,
} = require('../src/utils/requirement/resolveRequirementPersona');

describe('evaluateApproverFromProjectRoles', () => {
  it('allows when roles includes product_owner', () => {
    const result = evaluateApproverFromProjectRoles(
      [{ key: 'product_owner' }],
      ['product_owner', 'project_manager']
    );
    assert.equal(result.ok, true);
    assert.equal(result.via, 'project_role:product_owner');
  });

  it('denies when only business_analyst', () => {
    const result = evaluateApproverFromProjectRoles(
      [{ key: 'business_analyst' }],
      ['product_owner', 'project_manager']
    );
    assert.equal(result.ok, false);
    assert.equal(result.via, null);
  });

  it('allows project_manager by role key', () => {
    const result = evaluateApproverFromProjectRoles([{ key: 'project_manager' }]);
    assert.equal(result.ok, true);
    assert.equal(result.via, 'project_role:project_manager');
  });

  it('allows via analysis:po_review matrix even if key not in approver list', () => {
    // product_owner matrix includes analysis:po_review — use key that maps to PO perms
    const result = evaluateApproverFromProjectRoles([{ key: 'product_owner' }], [
      'never_match_key',
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.via, 'project_permission:analysis:po_review');
  });
});
