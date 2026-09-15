const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertIntakeLeadRoster,
  collectCreateProjectRoleKeys,
} = require('../src/utils/project/projectDeliveryRoster');

describe('assertIntakeLeadRoster', () => {
  it('T2 thiếu PM → throw PROJECT_ROSTER_INCOMPLETE', () => {
    assert.throws(
      () =>
        assertIntakeLeadRoster(
          collectCreateProjectRoleKeys({
            members: [
              { userId: 'u1', projectRoleKeys: ['product_owner'] },
              { userId: 'u2', projectRoleKeys: ['business_analyst'] },
            ],
          })
        ),
      (err) =>
        err.statusCode === 400 &&
        err.errorCode === 'PROJECT_ROSTER_INCOMPLETE' &&
        /Project Manager/i.test(err.message)
    );
  });

  it('T2 đủ PO+PM+BA (không Dev) → ok', () => {
    const keys = collectCreateProjectRoleKeys({
      members: [
        { userId: 'u1', projectRoleKeys: ['product_owner'] },
        { userId: 'u2', projectRoleKeys: ['project_manager'] },
        { userId: 'u3', projectRoleKeys: ['business_analyst'] },
      ],
    });
    const result = assertIntakeLeadRoster(keys);
    assert.equal(result.ok, true);
  });

  it('T2 kiêm nhiệm 1 user 3 roles → ok', () => {
    const keys = collectCreateProjectRoleKeys({
      members: [
        {
          userId: 'u1',
          projectRoleKeys: ['product_owner', 'project_manager', 'business_analyst'],
        },
      ],
    });
    assert.equal(assertIntakeLeadRoster(keys).ok, true);
  });
});
