import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { firstSeedMemberWithRole, WIZARD_PM_ROLE, WIZARD_SM_ROLE } from './projectWizardConstants.js';

describe('firstSeedMemberWithRole', () => {
  const members = [
    { userId: 'u1', projectRoleKeys: ['developer'] },
    { userId: 'u2', projectRoleKeys: ['project_manager', 'developer'] },
    { userId: 'u3', projectRoleKeys: ['scrum_master'] },
  ];

  it('tìm PM / SM từ seedMembers', () => {
    assert.equal(firstSeedMemberWithRole(members, WIZARD_PM_ROLE), 'u2');
    assert.equal(firstSeedMemberWithRole(members, WIZARD_SM_ROLE), 'u3');
  });

  it('không có role → rỗng', () => {
    assert.equal(firstSeedMemberWithRole(members, 'product_owner'), '');
    assert.equal(firstSeedMemberWithRole([], WIZARD_PM_ROLE), '');
  });
});
