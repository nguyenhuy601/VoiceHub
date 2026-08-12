const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeProjectVisibilityPolicy,
  defaultProjectVisibilityPolicy,
  maxInformationLevel,
} = require('../src/utils/projectVisibilityPolicy');

describe('projectVisibilityPolicy', () => {
  it('T1: default has system_admins discover always on', () => {
    const policy = defaultProjectVisibilityPolicy();
    assert.equal(policy.discoverAudiences.system_admins, true);
    assert.equal(policy.discoverAudiences.related_department_members, false);
    assert.equal(policy.defaultInformationLevels.related_department_managers, 'summary');
    assert.equal(policy.allowProjectManagerOverride, true);
  });

  it('T1b: cannot turn off system_admins discover', () => {
    const policy = normalizeProjectVisibilityPolicy({
      discoverAudiences: { system_admins: false, all_employees: true },
    });
    assert.equal(policy.discoverAudiences.system_admins, true);
    assert.equal(policy.discoverAudiences.all_employees, true);
  });

  it('maxInformationLevel picks confidential over summary', () => {
    assert.equal(maxInformationLevel(['summary', 'confidential', 'details']), 'confidential');
  });
});
