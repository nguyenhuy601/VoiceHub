const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRequirementAccessPolicy,
  validateRequirementAccessPolicy,
} = require('../src/utils/requirementAccessPolicy');

describe('organization-service requirementAccessPolicy utils', () => {
  it('re-exports shared normalize', () => {
    const policy = normalizeRequirementAccessPolicy({});
    assert.equal(policy.version, 1);
    assert.equal(policy.actions.approver.runAiPlanning, true);
  });

  it('validate accepts default approver mapping', () => {
    const result = validateRequirementAccessPolicy(normalizeRequirementAccessPolicy({}));
    assert.equal(result.ok, true);
  });
});
