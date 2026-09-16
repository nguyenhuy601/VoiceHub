const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  collectCreateProjectRoleKeys,
  deliveryRosterStatus,
} = require('../src/utils/project/projectDeliveryRoster');

describe('collectCreateProjectRoleKeys', () => {
  it('không mặc định product_owner khi members trống', () => {
    const keys = collectCreateProjectRoleKeys({ members: [] });
    assert.deepEqual(keys, []);
    assert.equal(deliveryRosterStatus(keys).hasProduct, false);
  });

  it('BA trên members đủ product band, không tự thêm PO', () => {
    const keys = collectCreateProjectRoleKeys({
      members: [{ userId: 'u1', projectRoleKeys: ['business_analyst', 'scrum_master'] }],
    });
    assert.ok(keys.includes('business_analyst'));
    assert.ok(!keys.includes('product_owner'));
    assert.equal(deliveryRosterStatus(keys).hasProduct, true);
  });

  it('productOwnerId slot vẫn thêm PO', () => {
    const keys = collectCreateProjectRoleKeys({
      productOwnerId: 'po1',
      members: [{ userId: 'u2', projectRoleKeys: ['developer'] }],
    });
    assert.ok(keys.includes('product_owner'));
  });
});
