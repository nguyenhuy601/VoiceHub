import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  firstSeedMemberWithRole,
  PROJECT_WIZARD_STEPS,
  WIZARD_PM_ROLE,
  WIZARD_SM_ROLE,
} from './projectWizardConstants.js';

describe('PROJECT_WIZARD_STEPS', () => {
  it('blank Phase 1: identity → roster → confirm', () => {
    assert.deepEqual([...PROJECT_WIZARD_STEPS], ['identity', 'roster', 'confirm']);
  });
});

describe('firstSeedMemberWithRole', () => {
  const members = [
    { userId: 'u1', projectRoleKeys: ['developer'] },
    { userId: 'u2', projectRoleKeys: ['project_manager', 'developer'] },
    { userId: 'u3', projectRoleKeys: ['scrum_master'] },
  ];

  it('tìm PM / SM từ seedMembers', () => {
    assert.equal(firstSeedMemberWithRole(members, WIZARD_PM_ROLE)?.userId, 'u2');
    assert.equal(firstSeedMemberWithRole(members, WIZARD_SM_ROLE)?.userId, 'u3');
  });

  it('không có role → null', () => {
    assert.equal(firstSeedMemberWithRole(members, 'product_owner'), null);
    assert.equal(firstSeedMemberWithRole([], WIZARD_PM_ROLE), null);
  });
});
