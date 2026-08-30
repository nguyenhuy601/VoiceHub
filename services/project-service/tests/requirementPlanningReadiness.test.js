const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseSkillsCsv,
  isKnownSkill,
  isKnownProjectRole,
} = require('../src/utils/requirementStaffingParse');
const { buildStaffingPlanFromParsed } = require('../src/utils/requirementStaffingRollup');
const {
  computePlanningReadiness,
  allLeavesHaveStaffing,
  assertPackReadyForSubmit,
  assertPackReadyForAiRun,
  HEURISTIC_THRESHOLD,
  FULL_ENGINE_THRESHOLD,
} = require('../src/utils/requirementPlanningReadiness');
const { validateBusinessLayer } = require('../src/utils/requirementTemplateValidate');

describe('requirementStaffingRollup', () => {
  it('parses skills CSV with semicolon', () => {
    assert.deepEqual(parseSkillsCsv('React; REST API'), ['React', 'REST API']);
  });

  it('rollup sums leaf hours and unions skills', () => {
    const plan = buildStaffingPlanFromParsed({
      overview: { startDate: '2026-01-01', budgetCurrency: 'VND' },
      functionalRequirements: [
        {
          level: 'Requirement',
          suggestedSkills: ['React', 'TypeScript'],
          estimateHours: 40,
          suggestedRoleKey: 'frontend_developer',
        },
        {
          level: 'Module',
          suggestedSkills: ['Java'],
          estimateHours: 10,
          suggestedRoleKey: 'backend_developer',
        },
      ],
    });
    assert.equal(plan.estimatedHoursTotal, 40);
    assert.ok(plan.requiredSkills.some((s) => s.name === 'React'));
    assert.ok(plan.requiredRoles.some((r) => r.roleKey === 'frontend_developer'));
    assert.equal(plan.budgetCurrency, 'VND');
  });

  it('recognizes whitelist skill and project role', () => {
    assert.equal(isKnownSkill('React'), true);
    assert.equal(isKnownSkill('UnknownSkillX'), false);
    assert.equal(isKnownProjectRole('frontend_developer'), true);
    assert.equal(isKnownProjectRole('unknown_role_x'), false);
  });
});

describe('requirementPlanningReadiness', () => {
  it('scores low for empty pack', () => {
    const r = computePlanningReadiness({ overview: {}, functionalRequirements: [] });
    assert.equal(r.score, 0);
    assert.equal(r.readyForHeuristic, false);
    assert.equal(r.readyForFullEngine, false);
    assert.equal(r.allLeavesStaffed, false);
  });

  it('scores >= 80 when deadline + leaf + effort + skills + roles', () => {
    const r = computePlanningReadiness({
      overview: { deadline: new Date('2026-12-30'), platform: ['Web'] },
      functionalRequirements: [
        {
          level: 'Requirement',
          estimateHours: 8,
          suggestedSkills: ['React'],
          suggestedRoleKey: 'frontend_developer',
        },
      ],
      staffingPlan: {},
    });
    assert.ok(r.score >= FULL_ENGINE_THRESHOLD);
    assert.equal(r.readyForFullEngine, true);
    assert.equal(r.allLeavesStaffed, true);
  });

  it('readyForHeuristic at threshold 40', () => {
    const r = computePlanningReadiness({
      overview: { deadline: new Date('2026-12-30') },
      functionalRequirements: [{ level: 'Requirement', name: 'Login' }],
    });
    assert.equal(r.score, 15 + 25);
    assert.equal(r.readyForHeuristic, r.score >= HEURISTIC_THRESHOLD);
    assert.equal(r.allLeavesStaffed, false);
  });

  it('allLeavesHaveStaffing requires skills hours and role on every leaf', () => {
    assert.equal(
      allLeavesHaveStaffing({
        functionalRequirements: [
          {
            level: 'Requirement',
            suggestedSkills: ['React'],
            estimateHours: 8,
            suggestedRoleKey: 'frontend_developer',
          },
        ],
      }),
      true
    );
    assert.equal(
      allLeavesHaveStaffing({
        functionalRequirements: [
          {
            level: 'Requirement',
            suggestedSkills: ['React'],
            estimateHours: 8,
            suggestedRoleKey: '',
          },
        ],
      }),
      false
    );
  });

  it('assertPackReadyForSubmit throws when leaf staffing incomplete', () => {
    assert.throws(
      () =>
        assertPackReadyForSubmit({
          overview: { deadline: new Date('2026-12-30') },
          functionalRequirements: [{ level: 'Requirement', name: 'Login' }],
        }),
      (err) => err.errorCode === 'REQ_NOT_READY_FOR_SUBMIT' && err.statusCode === 422
    );
  });

  it('assertPackReadyForSubmit passes when all leaves staffed without pack-level deadline', () => {
    const readiness = assertPackReadyForSubmit({
      overview: {},
      functionalRequirements: [
        {
          level: 'Requirement',
          suggestedSkills: ['React'],
          estimateHours: 8,
          suggestedRoleKey: 'frontend_developer',
        },
      ],
    });
    assert.equal(readiness.allLeavesStaffed, true);
    assert.ok(readiness.score < 100);
  });

  it('assertPackReadyForSubmit passes when heuristic and leaf staffing ok', () => {
    const readiness = assertPackReadyForSubmit({
      overview: { deadline: new Date('2026-12-30') },
      functionalRequirements: [
        {
          level: 'Requirement',
          suggestedSkills: ['React'],
          estimateHours: 8,
          suggestedRoleKey: 'frontend_developer',
        },
      ],
    });
    assert.equal(readiness.readyForHeuristic, true);
    assert.equal(readiness.allLeavesStaffed, true);
  });

  it('lists missingLeafIds for incomplete leaves', () => {
    const r = computePlanningReadiness({
      overview: { deadline: new Date('2026-12-30') },
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Requirement',
          name: 'Login',
          suggestedSkills: ['React'],
          estimateHours: 8,
          suggestedRoleKey: '',
        },
        {
          externalId: 'FR-002',
          level: 'Requirement',
          name: 'Logout',
          suggestedSkills: ['React'],
          estimateHours: 4,
          suggestedRoleKey: 'frontend_developer',
        },
      ],
    });
    assert.deepEqual(r.missingLeafIds, ['FR-001']);
    assert.equal(r.allLeavesStaffed, false);
  });

  it('assertPackReadyForAiRun throws with missingLeafIds when incomplete', () => {
    assert.throws(
      () =>
        assertPackReadyForAiRun({
          overview: { deadline: new Date('2026-12-30') },
          functionalRequirements: [
            {
              externalId: 'FR-010',
              level: 'Requirement',
              name: 'Pay',
              suggestedSkills: [],
              estimateHours: null,
              suggestedRoleKey: '',
            },
          ],
        }),
      (err) =>
        err.errorCode === 'REQ_NOT_READY_FOR_AI' &&
        err.statusCode === 422 &&
        Array.isArray(err.details?.missingLeafIds) &&
        err.details.missingLeafIds.includes('FR-010')
    );
  });

  it('assertPackReadyForAiRun passes when ready', () => {
    const readiness = assertPackReadyForAiRun({
      overview: { deadline: new Date('2026-12-30') },
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Requirement',
          suggestedSkills: ['React'],
          estimateHours: 8,
          suggestedRoleKey: 'frontend_developer',
        },
      ],
    });
    assert.equal(readiness.allLeavesStaffed, true);
    assert.deepEqual(readiness.missingLeafIds, []);
  });
});

describe('requirementTemplateValidate staffing warnings', () => {
  it('warns effort on Module level without error', () => {
    const issues = validateBusinessLayer({
      overview: {
        requirementName: 'Test',
        projectObjective: 'Obj',
        businessScope: 'Scope',
        platform: 'Web',
        expectedUsers: '1000',
        deadline: '2026-12-30',
        priority: 'High',
      },
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Auth',
          description: '',
          priority: 'High',
          estimateHours: 10,
          suggestedSkills: [],
          suggestedRoleKey: '',
          _rowNumber: 2,
        },
      ],
    });
    assert.ok(issues.some((i) => i.code === 'REQ_FR_EFFORT_NON_LEAF' && i.severity === 'warning'));
    assert.equal(
      issues.some((i) => i.severity === 'error' && i.code === 'REQ_FR_EFFORT_NON_LEAF'),
      false
    );
  });
});
