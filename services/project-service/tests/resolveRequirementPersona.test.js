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
  organizationRoleMatchesOperator,
  positionCodesMatchMapping,
} = require('../src/utils/resolveRequirementPersona');

describe('resolveRequirementPersona', () => {
  const policy = defaultRequirementAccessPolicy();
  const orgId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';

  it('maps Business Analyst job title fallback to submitter when no Position', async () => {
    const result = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'member',
      organizationRoleKeys: [],
      positionCodes: [],
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

  it('maps positionCode business_analyst to submitter without jobTitle', async () => {
    const result = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'member',
      organizationRoleKeys: [],
      positionCodes: ['business_analyst'],
      jobTitle: '',
      policy,
    });
    assert.equal(result.isSubmitter, true);
    assert.equal(result.visibility.collaborateRequirements, true);
  });

  it('maps Product Manager job title to approver persona', async () => {
    const result = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'member',
      organizationRoleKeys: [],
      positionCodes: [],
      jobTitle: 'Product Manager',
      policy,
    });
    assert.equal(result.isApprover, true);
    assert.equal(result.actions.approve, true);
    assert.equal(result.actions.runAiPlanning, true);
    assert.equal(result.actions.import, false);
  });

  it('maps DIRECTOR org role to operator — not membership admin', async () => {
    const withDirector = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'member',
      organizationRoleKeys: ['DIRECTOR'],
      positionCodes: [],
      jobTitle: 'Software Developer',
      policy,
    });
    assert.equal(withDirector.isOperator, true);
    assert.equal(withDirector.actions.import, true);
    assert.equal(withDirector.visibility.adminRequirements, true);

    const membershipOnly = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'admin',
      organizationRoleKeys: [],
      positionCodes: [],
      jobTitle: 'Software Developer',
      policy,
    });
    assert.equal(membershipOnly.isOperator, false);
  });

  it('membership hr alone is not operator', async () => {
    const result = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'hr',
      organizationRoleKeys: [],
      positionCodes: [],
      jobTitle: 'Software Developer',
      policy,
    });
    assert.equal(result.isOperator, false);
  });

  it('HR_APPROVER org role is operator', async () => {
    const result = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'member',
      organizationRoleKeys: ['HR_APPROVER'],
      positionCodes: [],
      jobTitle: '',
      policy,
    });
    assert.equal(result.isOperator, true);
  });

  it('merges submitter + operator for DIRECTOR who is also BA', async () => {
    const result = await resolveRequirementPersona({
      userId,
      organizationId: orgId,
      membershipRole: 'member',
      organizationRoleKeys: ['DIRECTOR'],
      positionCodes: ['business_analyst'],
      jobTitle: '',
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
      organizationRoleKeys: [],
      positionCodes: [],
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

  it('positionCodesMatchMapping matches catalog keys', () => {
    const mapping = policy.personaByPosition.submitter;
    assert.equal(positionCodesMatchMapping(['business_analyst'], mapping), true);
    assert.equal(positionCodesMatchMapping(['backend_developer'], mapping), false);
  });

  it('organizationRoleMatchesOperator recognizes DIRECTOR', () => {
    assert.equal(organizationRoleMatchesOperator(['DIRECTOR'], policy), true);
    assert.equal(organizationRoleMatchesOperator(['MEMBER'], policy), false);
  });

  it('membershipRoleMatchesOperator is empty by default policy', () => {
    assert.equal(membershipRoleMatchesOperator('hr', policy), false);
    assert.equal(membershipRoleMatchesOperator('admin', policy), false);
  });
});
