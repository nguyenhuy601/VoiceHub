const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  deliveryRosterStatus,
  assertDeliveryRoster,
  collectCreateProjectRoleKeys,
} = require('../src/utils/projectDeliveryRoster');

describe('projectDeliveryRoster', () => {
  it('một user 3 keys → pass', () => {
    const keys = ['product_owner', 'scrum_master', 'backend_developer'];
    const status = deliveryRosterStatus(keys);
    assert.equal(status.hasProduct, true);
    assert.equal(status.hasFacilitate, true);
    assert.equal(status.hasBuild, true);
    assert.doesNotThrow(() => assertDeliveryRoster(keys));
  });

  it('thiếu Dev/QA → fail', () => {
    assert.throws(
      () => assertDeliveryRoster(['product_owner', 'scrum_master']),
      /Dev hoặc QA|PROJECT_ROSTER|400/
    );
  });

  it('BA + PM + QA đủ 3 band', () => {
    const status = deliveryRosterStatus(['business_analyst', 'project_manager', 'qa_engineer']);
    assert.equal(status.hasProduct, true);
    assert.equal(status.hasFacilitate, true);
    assert.equal(status.hasBuild, true);
  });

  it('collectCreateProjectRoleKeys gồm creator PO + seed + SM slot', () => {
    const keys = collectCreateProjectRoleKeys({
      scrumMasterId: 'u2',
      members: [{ userId: 'u3', projectRoleKeys: ['frontend_developer'] }],
    });
    assert.ok(keys.includes('product_owner'));
    assert.ok(keys.includes('scrum_master'));
    assert.ok(keys.includes('frontend_developer'));
  });
});
