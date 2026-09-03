const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  defaultRequirementAccessPolicy,
  normalizeRequirementAccessPolicy,
  validateRequirementAccessPolicy,
  mergePersonaActions,
  mergePersonaVisibility,
} = require('../config/requirementAccessPolicy');

describe('requirementAccessPolicy', () => {
  it('default policy matches BA/PO/PM matrix', () => {
    const policy = defaultRequirementAccessPolicy();
    assert.deepEqual(policy.personaByPosition.submitter.positionKeys, ['business_analyst']);
    assert.equal(policy.actions.submitter.submit, true);
    assert.equal(policy.actions.submitter.approve, false);
    assert.equal(policy.actions.submitter.runAiPlanning, false);
    assert.equal(policy.actions.approver.approve, true);
    assert.equal(policy.actions.approver.runAiPlanning, true);
    assert.equal(policy.visibility.submitter.collaborateRequirements, true);
    assert.equal(policy.visibility.operator.adminRequirements, true);
  });

  it('merge persona actions uses OR across matched personas', () => {
    const policy = defaultRequirementAccessPolicy();
    const merged = mergePersonaActions(['submitter', 'operator'], policy);
    assert.equal(merged.import, true);
    assert.equal(merged.submit, true);
    assert.equal(merged.runAiPlanning, true);
    assert.equal(merged.approve, false);
  });

  it('merge persona visibility uses OR', () => {
    const policy = defaultRequirementAccessPolicy();
    const merged = mergePersonaVisibility(['submitter', 'operator'], policy);
    assert.equal(merged.collaborateRequirements, true);
    assert.equal(merged.adminRequirements, true);
  });

  it('validate rejects policy without approver mapping', () => {
    const bad = normalizeRequirementAccessPolicy({
      personaByPosition: {
        submitter: { positionKeys: ['business_analyst'], projectRoleKeys: [], aliases: [] },
        approver: { positionKeys: [], projectRoleKeys: [], aliases: [] },
      },
      actions: {
        approver: {
          view: true,
          import: false,
          submit: false,
          approve: false,
          runAiPlanning: false,
          createProject: false,
          reviewSkills: false,
        },
      },
    });
    const result = validateRequirementAccessPolicy(bad);
    assert.equal(result.ok, false);
  });

  it('normalize fills missing keys from defaults', () => {
    const policy = normalizeRequirementAccessPolicy({ version: 1 });
    assert.equal(policy.actions.member.view, true);
    assert.equal(policy.personaByOrgRole.operator.membershipRoles.includes('hr'), true);
  });
});
