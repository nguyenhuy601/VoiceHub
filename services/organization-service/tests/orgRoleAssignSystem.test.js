const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateAssignmentRoleKeys,
} = require('../src/utils/orgRoleAssignPolicy');

describe('orgRoleAssignPolicy — system catalog assignable', () => {
  it('allows isSystem keys when present in catalog', () => {
    const roleByKey = new Map([
      ['department_manager', { key: 'department_manager', isSystem: true }],
      ['director', { key: 'director', isSystem: true }],
    ]);
    const result = validateAssignmentRoleKeys(['department_manager', 'director'], roleByKey);
    assert.equal(result.ok, true);
  });

  it('allows custom keys when present in catalog', () => {
    const roleByKey = new Map([['custom_lead', { key: 'custom_lead', isSystem: false }]]);
    const result = validateAssignmentRoleKeys(['custom_lead'], roleByKey);
    assert.equal(result.ok, true);
  });

  it('rejects unknown keys not in catalog', () => {
    const roleByKey = new Map([['director', { key: 'director', isSystem: true }]]);
    const result = validateAssignmentRoleKeys(['director', 'missing_role'], roleByKey);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NOT_FOUND');
    assert.equal(result.key, 'missing_role');
  });
});
