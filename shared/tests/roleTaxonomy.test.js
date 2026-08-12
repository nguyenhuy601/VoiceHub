const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLE_KIND,
  ORGANIZATION_ROLE_KEYS,
  LEGACY_MEMBERSHIP_ALIAS_DEBT,
  assertNotHrRoleForPermission,
} = require('../config/roleTaxonomy');
const { isAssignmentEngineEnabled } = require('../config/assignmentEngine');

describe('roleTaxonomy', () => {
  it('exposes three role kinds plus system', () => {
    assert.equal(ROLE_KIND.HR, 'hr_role');
    assert.equal(ROLE_KIND.ORGANIZATION, 'organization_role');
    assert.equal(ROLE_KIND.PROJECT, 'project_role');
    assert.equal(ROLE_KIND.SYSTEM, 'system_membership');
  });

  it('documents department_head alias debt', () => {
    assert.equal(
      LEGACY_MEMBERSHIP_ALIAS_DEBT.department_head.correctKey,
      ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER
    );
    assert.notEqual(LEGACY_MEMBERSHIP_ALIAS_DEBT.department_head.correctKind, ROLE_KIND.SYSTEM);
  });

  it('forbids HR role for permission', () => {
    assert.throws(() => assertNotHrRoleForPermission(ROLE_KIND.HR), /HR Role/);
    assert.doesNotThrow(() => assertNotHrRoleForPermission(ROLE_KIND.PROJECT));
  });
});

describe('assignmentEngine flag', () => {
  it('defaults to enabled when unset', () => {
    const saved = process.env.ASSIGNMENT_ENGINE_V1;
    delete process.env.ASSIGNMENT_ENGINE_V1;
    assert.equal(isAssignmentEngineEnabled(), true);
    if (saved === undefined) delete process.env.ASSIGNMENT_ENGINE_V1;
    else process.env.ASSIGNMENT_ENGINE_V1 = saved;
  });

  it('respects false', () => {
    const saved = process.env.ASSIGNMENT_ENGINE_V1;
    process.env.ASSIGNMENT_ENGINE_V1 = 'false';
    assert.equal(isAssignmentEngineEnabled(), false);
    if (saved === undefined) delete process.env.ASSIGNMENT_ENGINE_V1;
    else process.env.ASSIGNMENT_ENGINE_V1 = saved;
  });
});
