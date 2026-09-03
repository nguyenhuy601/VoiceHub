const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRequirementAccessPolicy,
  defaultRequirementAccessPolicy,
} = require('@enterprise/shared/config/requirementAccessPolicy');
const {
  resolveRequirementPersona,
  jobTitleMatchesMapping,
  membershipRoleMatchesOperator,
} = require('../src/utils/resolveRequirementPersona');

describe('resolveRequirementPersona', () => {
  const policy = defaultRequirementAccessPolicy();
  const orgId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';

  it('maps Business Analyst job title to submitter persona', async () => {
    const result = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'member',
      jobTitle: 'Business Analyst',
      policy,
    });
    assert.equal(result.isSubmitter, true);
    assert.equal(result.isApprover, false);
    assert.equal(result.actions.submit, true);
    assert.equal(result.actions.approve, false);
    assert.equal(result.actions.runAiPlanning, false);
    assert.equal(result.visibility.collaborateRequirements, true);
  });

  it('maps Product Manager job title to approver persona', async () => {
    const result = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'member',
      jobTitle: 'Product Manager',
      policy,
    });
    assert.equal(result.isApprover, true);
    assert.equal(result.actions.approve, true);
    assert.equal(result.actions.runAiPlanning, true);
    assert.equal(result.actions.import, false);
  });

  it('maps org admin membership to operator actions', async () => {
    const result = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'admin',
      jobTitle: 'Software Developer',
      policy,
    });
    assert.equal(result.isOperator, true);
    assert.equal(result.actions.import, true);
    assert.equal(result.actions.runAiPlanning, true);
    assert.equal(result.visibility.adminRequirements, true);
  });

  it('merges submitter + operator for org admin who is also BA', async () => {
    const result = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'owner',
      jobTitle: 'Business Analyst',
      policy,
    });
    assert.equal(result.isSubmitter, true);
    assert.equal(result.isOperator, true);
    assert.equal(result.actions.submit, true);
    assert.equal(result.actions.import, true);
    assert.equal(result.visibility.collaborateRequirements, true);
    assert.equal(result.visibility.adminRequirements, true);
  });

  it('custom policy can disable AI for approver', async () => {
    const custom = normalizeRequirementAccessPolicy({
      actions: {
        approver: {
          ...policy.actions.approver,
          runAiPlanning: false,
        },
      },
    });
    const result = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'member',
      jobTitle: 'Project Manager',
      policy: custom,
    });
    assert.equal(result.actions.runAiPlanning, false);
    assert.equal(result.actions.approve, true);
  });

  it('jobTitleMatchesMapping accepts alias project manager', () => {
    const mapping = policy.personaByPosition.approver;
    assert.equal(jobTitleMatchesMapping('Project Manager', mapping), true);
  });

  it('membershipRoleMatchesOperator recognizes hr', () => {
    assert.equal(membershipRoleMatchesOperator('hr', policy), true);
    assert.equal(membershipRoleMatchesOperator('member', policy), false);
  });
});
