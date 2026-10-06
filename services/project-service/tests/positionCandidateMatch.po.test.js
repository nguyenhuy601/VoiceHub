/**
 * Product Owner preferred positions must not include Business Analyst.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  preferredPositionsForProjectRole,
  scorePositionMatch,
} = require('../src/utils/staffing/positionCandidateMatch');

describe('product_owner position match', () => {
  it('does not prefer business_analyst job title for product_owner', () => {
    const preferred = preferredPositionsForProjectRole('product_owner');
    assert.equal(preferred.includes('business_analyst'), false);
    assert.ok(preferred.includes('product_manager'));

    const ba = scorePositionMatch({
      jobTitle: 'Business Analyst',
      projectRoleKey: 'product_owner',
      enabledPositionKeys: null,
    });
    assert.equal(ba.preferred, false);

    const pm = scorePositionMatch({
      jobTitle: 'Product Manager',
      projectRoleKey: 'product_owner',
      enabledPositionKeys: null,
    });
    assert.equal(pm.preferred, true);
  });

  it('still prefers business_analyst for business_analyst column', () => {
    const ba = scorePositionMatch({
      jobTitle: 'Business Analyst',
      projectRoleKey: 'business_analyst',
      enabledPositionKeys: null,
    });
    assert.equal(ba.preferred, true);
  });
});
