const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isOrgElevatedMembershipRole,
  memberScopedProjectFilter,
} = require('../src/utils/projectListMembershipScope');

describe('projectListMembershipScope', () => {
  it('elevated: owner and admin only', () => {
    assert.equal(isOrgElevatedMembershipRole('owner'), true);
    assert.equal(isOrgElevatedMembershipRole('admin'), true);
    assert.equal(isOrgElevatedMembershipRole('Admin'), true);
    assert.equal(isOrgElevatedMembershipRole('member'), false);
    assert.equal(isOrgElevatedMembershipRole('hr'), false);
    assert.equal(isOrgElevatedMembershipRole(''), false);
  });

  it('memberScopedProjectFilter: creator or membership ids', () => {
    const userOid = '507f1f77bcf86cd799439011';
    const p1 = '507f1f77bcf86cd799439021';
    const p2 = '507f1f77bcf86cd799439022';
    const base = { organizationId: '507f1f77bcf86cd799439001', isActive: true };

    const filter = memberScopedProjectFilter(base, userOid, [p1]);
    assert.equal(filter.isActive, true);
    assert.ok(Array.isArray(filter.$or));
    assert.equal(filter.$or.length, 2);
    assert.deepEqual(filter.$or[0], { createdBy: userOid });
    assert.deepEqual(filter.$or[1], { _id: { $in: [p1] } });

    const onlyCreator = memberScopedProjectFilter(base, userOid, []);
    assert.equal(onlyCreator.$or.length, 1);
    assert.deepEqual(onlyCreator.$or[0], { createdBy: userOid });

    const both = memberScopedProjectFilter(base, userOid, [p1, p2]);
    assert.deepEqual(both.$or[1]._id.$in, [p1, p2]);
  });
});
