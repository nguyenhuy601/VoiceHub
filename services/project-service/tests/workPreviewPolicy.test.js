const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldRestrictWorkPreview,
  restrictedWorkPreviewBody,
} = require('../src/utils/workPreviewPolicy');

describe('workPreviewPolicy (T2)', () => {
  it('restricts non-members', () => {
    assert.equal(
      shouldRestrictWorkPreview({ isMember: false, informationLevel: 'details', hasViewPermission: true }),
      true
    );
  });

  it('restricts summary-only and missing view perm', () => {
    assert.equal(
      shouldRestrictWorkPreview({ isMember: true, informationLevel: 'summary', hasViewPermission: true }),
      true
    );
    assert.equal(
      shouldRestrictWorkPreview({ isMember: true, informationLevel: 'details', hasViewPermission: false }),
      true
    );
  });

  it('allows member with view at details+', () => {
    assert.equal(
      shouldRestrictWorkPreview({ isMember: true, informationLevel: 'details', hasViewPermission: true }),
      false
    );
  });

  it('restricted body uses not_project_member and no extra fields', () => {
    const body = restrictedWorkPreviewBody();
    assert.equal(body.restricted, true);
    assert.equal(body.reason, 'not_project_member');
    assert.deepEqual(Object.keys(body).sort(), ['reason', 'restricted']);
  });
});
