const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildStaffingBaselineFromPack,
  computeStaffingDelta,
  resolveCapacityPerFte,
  collectLeafRoleKeys,
  DEFAULT_FTE_CAPACITY_HOURS,
} = require('../src/utils/aiPlanningStaffingBaseline');

function packWithLeaves(leaves, overrides = {}) {
  return {
    overview: { requirementName: 'Demo', startDate: '2026-01-01', deadline: '2026-06-30' },
    functionalRequirements: leaves,
    staffingPlan: { requiredSkills: [], requiredRoles: [], estimatedHoursTotal: null },
    ...overrides,
  };
}

describe('aiPlanningStaffingBaseline', () => {
  it('derives FTE from 20 leaves x 8h with default capacity when no window', () => {
    const leaves = Array.from({ length: 20 }, (_, i) => ({
      externalId: `FR-${i + 1}`,
      level: 'Task',
      suggestedRoleKey: 'frontend_developer',
      suggestedSkills: ['React'],
      estimateHours: 8,
    }));
    const pack = packWithLeaves(leaves);
    const baseline = buildStaffingBaselineFromPack(pack);

    assert.equal(baseline.totalLeafHours, 160);
    assert.equal(baseline.leafCountByRole.frontend_developer, 20);
    assert.equal(baseline.capacityPerFte, DEFAULT_FTE_CAPACITY_HOURS);
    assert.equal(baseline.fteByRole.frontend_developer, 1);
    assert.equal(baseline.fteRoles.length, 1);
    assert.equal(baseline.fteRoles[0].requiredCount, 1);
    assert.equal(baseline.fteRoles[0].roleHours, 160);
  });

  it('uses window workingDays for capacityPerFte', () => {
    const leaves = [
      {
        externalId: 'FR-1',
        level: 'Task',
        suggestedRoleKey: 'backend_developer',
        estimateHours: 320,
      },
    ];
    const baseline = buildStaffingBaselineFromPack(packWithLeaves(leaves), {
      window: { workingDays: 50, from: '2026-01-01', to: '2026-06-30' },
    });
    const expectedCapacity = Math.max(1, Math.round(50 * 8 * 0.8));
    assert.equal(baseline.capacityPerFte, expectedCapacity);
    assert.equal(baseline.fteByRole.backend_developer, Math.ceil(320 / expectedCapacity));
  });

  it('handles workingDays=0 with default capacity', () => {
    assert.equal(resolveCapacityPerFte({ workingDays: 0 }), DEFAULT_FTE_CAPACITY_HOURS);
    assert.equal(resolveCapacityPerFte(null), DEFAULT_FTE_CAPACITY_HOURS);
  });

  it('leafCountByRole counts only Task level not Epic', () => {
    const pack = packWithLeaves([
      { externalId: 'E-1', level: 'Epic', suggestedRoleKey: 'frontend_developer' },
      { externalId: 'FR-1', level: 'Task', suggestedRoleKey: 'frontend_developer', estimateHours: 10 },
      { externalId: 'FR-2', level: 'Task', suggestedRoleKey: 'frontend_developer', estimateHours: 10 },
    ]);
    const baseline = buildStaffingBaselineFromPack(pack);
    assert.equal(baseline.leafCountByRole.frontend_developer, 2);
  });

  it('computeStaffingDelta reports role and hours changes', () => {
    const pack = packWithLeaves([
      {
        externalId: 'FR-1',
        level: 'Task',
        suggestedRoleKey: 'frontend_developer',
        suggestedSkills: ['React'],
        estimateHours: 100,
      },
      {
        externalId: 'FR-2',
        level: 'Task',
        suggestedRoleKey: 'backend_developer',
        suggestedSkills: ['Java'],
        estimateHours: 100,
      },
    ]);
    const baseline = buildStaffingBaselineFromPack(pack);
    const delta = computeStaffingDelta(baseline, {
      requiredRoles: [{ roleKey: 'frontend_developer', requiredCount: 2 }],
      requiredSkills: [{ name: 'React' }, { name: 'TypeScript' }],
      estimatedHoursTotal: 250,
    });
    assert.ok(delta.rolesRemoved.includes('backend_developer'));
    assert.ok(delta.skillsAdded.includes('typescript'));
    assert.equal(delta.hoursDeltaPct, 25);
  });

  it('hoursDeltaPct null when totalLeafHours=0', () => {
    const baseline = buildStaffingBaselineFromPack(
      packWithLeaves([
        {
          externalId: 'FR-1',
          level: 'Task',
          suggestedRoleKey: 'qa_engineer',
          estimateHours: null,
        },
      ])
    );
    const delta = computeStaffingDelta(baseline, {
      requiredRoles: [{ roleKey: 'qa_engineer', requiredCount: 1 }],
      estimatedHoursTotal: 100,
    });
    assert.equal(delta.hoursDeltaPct, null);
  });

  it('collectLeafRoleKeys returns unique leaf roles', () => {
    const keys = collectLeafRoleKeys(
      packWithLeaves([
        { level: 'Task', suggestedRoleKey: 'frontend_developer' },
        { level: 'Task', suggestedRoleKey: 'frontend_developer' },
        { level: 'Epic', suggestedRoleKey: 'backend_developer' },
      ])
    );
    assert.deepEqual([...keys].sort(), ['frontend_developer']);
  });
});
