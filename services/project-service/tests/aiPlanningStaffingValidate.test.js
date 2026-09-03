const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildStaffingBaselineFromPack } = require('../src/utils/aiPlanningStaffingBaseline');
const {
  validateStaffingProposal,
  deriveStaffingStatus,
  emptyValidation,
} = require('../src/utils/aiPlanningStaffingValidate');

function fixturePack() {
  return {
    functionalRequirements: [
      {
        externalId: 'FR-1',
        level: 'Requirement',
        suggestedRoleKey: 'frontend_developer',
        suggestedSkills: ['React'],
        estimateHours: 100,
      },
      {
        externalId: 'FR-2',
        level: 'Requirement',
        suggestedRoleKey: 'backend_developer',
        suggestedSkills: ['Java'],
        estimateHours: 100,
      },
    ],
    overview: {},
  };
}

describe('aiPlanningStaffingValidate', () => {
  it('returns skipped when proposal is null', () => {
    const baseline = buildStaffingBaselineFromPack(fixturePack());
    const result = validateStaffingProposal({ proposal: null, baseline, pack: fixturePack() });
    assert.equal(result.status, 'skipped');
    assert.deepEqual(result.errors, []);
  });

  it('rejects when missing leaf role', () => {
    const pack = fixturePack();
    const baseline = buildStaffingBaselineFromPack(pack);
    const result = validateStaffingProposal({
      proposal: {
        requiredRoles: [{ roleKey: 'frontend_developer', requiredCount: 1 }],
        requiredSkills: [{ name: 'React' }],
        estimatedHoursTotal: 200,
      },
      baseline,
      pack,
    });
    assert.equal(result.status, 'rejected');
    assert.ok(result.errors.some((e) => e.code === 'missing_leaf_role' && e.roleKey === 'backend_developer'));
  });

  it('rejects when hours delta exceeds 50%', () => {
    const pack = fixturePack();
    const baseline = buildStaffingBaselineFromPack(pack);
    const result = validateStaffingProposal({
      proposal: {
        requiredRoles: [
          { roleKey: 'frontend_developer', requiredCount: 1 },
          { roleKey: 'backend_developer', requiredCount: 1 },
        ],
        requiredSkills: [{ name: 'React' }, { name: 'Java' }],
        estimatedHoursTotal: 350,
      },
      baseline,
      pack,
    });
    assert.equal(result.status, 'rejected');
    assert.ok(result.errors.some((e) => e.code === 'hours_delta_exceeded'));
  });

  it('warns when hours delta 25-50%', () => {
    const pack = fixturePack();
    const baseline = buildStaffingBaselineFromPack(pack);
    const result = validateStaffingProposal({
      proposal: {
        requiredRoles: [
          { roleKey: 'frontend_developer', requiredCount: 1 },
          { roleKey: 'backend_developer', requiredCount: 1 },
        ],
        requiredSkills: [{ name: 'React' }, { name: 'Java' }],
        estimatedHoursTotal: 260,
      },
      baseline,
      pack,
    });
    assert.equal(result.status, 'warnings');
    assert.ok(result.warnings.some((w) => w.code === 'hours_delta_warning'));
  });

  it('ok when proposal aligns with leaves', () => {
    const pack = fixturePack();
    const baseline = buildStaffingBaselineFromPack(pack);
    const result = validateStaffingProposal({
      proposal: {
        requiredRoles: [
          { roleKey: 'frontend_developer', requiredCount: 2 },
          { roleKey: 'backend_developer', requiredCount: 1 },
        ],
        requiredSkills: [{ name: 'React' }, { name: 'Java' }],
        estimatedHoursTotal: 200,
      },
      baseline,
      pack,
    });
    assert.equal(result.status, 'ok');
  });

  it('does not reject when LLM FTE differs from leaf count', () => {
    const pack = {
      functionalRequirements: Array.from({ length: 20 }, (_, i) => ({
        externalId: `FR-${i}`,
        level: 'Requirement',
        suggestedRoleKey: 'frontend_developer',
        estimateHours: 8,
      })),
    };
    const baseline = buildStaffingBaselineFromPack(pack);
    const result = validateStaffingProposal({
      proposal: {
        requiredRoles: [{ roleKey: 'frontend_developer', requiredCount: 2 }],
        requiredSkills: [{ name: 'React' }],
        estimatedHoursTotal: 160,
      },
      baseline,
      pack,
    });
    assert.notEqual(result.status, 'rejected');
  });

  it('deriveStaffingStatus maps rejected semantic', () => {
    assert.equal(
      deriveStaffingStatus({ status: 'proposed' }, { status: 'rejected' }),
      'rejected_semantic'
    );
    assert.equal(
      deriveStaffingStatus({ status: 'proposed' }, { status: 'warnings' }),
      'proposed_with_warnings'
    );
    assert.equal(deriveStaffingStatus({ status: 'failed' }, emptyValidation()), 'failed');
  });

  it('canApproveStaffingProposal blocks rejected and missing proposal', () => {
    const { canApproveStaffingProposal } = require('../src/utils/aiPlanningStaffingValidate');
    assert.equal(canApproveStaffingProposal(null), false);
    assert.equal(
      canApproveStaffingProposal({
        staffingProposal: { requiredRoles: [] },
        proposalValidation: { status: 'rejected' },
      }),
      false
    );
    assert.equal(
      canApproveStaffingProposal({
        staffingProposal: { requiredRoles: [{ roleKey: 'frontend_developer', requiredCount: 1 }] },
        proposalValidation: { status: 'ok' },
      }),
      true
    );
  });
});
