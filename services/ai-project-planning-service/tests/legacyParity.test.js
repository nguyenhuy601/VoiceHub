/**
 * Contract tests for ported HOW engines (no dual-run against deleted project-service files).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const portedRoleSkill = require('../src/engines/roleSkill');
const portedEffort = require('../src/engines/effort');
const portedCpm = require('../src/engines/sequencingCpm');
const portedMatching = require('../src/engines/employeeMatching');
const portedAssignment = require('../src/engines/assignment');
const portedSchedule = require('../src/engines/scheduleCapacity');

function fixture() {
  return {
    jobs: {},
    analyses: {
      capability: {
        items: [
          {
            capabilityId: 'CAP-1',
            module: 'Auth',
            complexity: 'high',
            requiredSkills: [' React ', { name: 'react', level: 4 }, 'Node.js'],
          },
          {
            capabilityId: 'CAP-2',
            complexity: 'medium',
            requiredSkills: [{ name: 'QA', level: 3 }],
          },
        ],
      },
      data: {
        entities: [{ sensitivity: 'pii', attributes: [{ name: 'email' }] }],
      },
      architectureImpact: {
        items: [{ layer: 'frontend' }, { layer: 'deployment' }],
      },
      dependency: {
        edges: [
          { from: 'B', to: 'A', critical: true, type: 'external' },
          { from: 'C', to: 'B' },
        ],
      },
      risk: {
        items: Array.from({ length: 4 }, (_, index) => ({
          id: `R${index}`,
          band: 'high',
        })),
      },
    },
    planning: {
      tasks: [
        {
          id: 'A',
          name: 'Root delivery',
          area: 'frontend',
          suggestedRoleKey: 'Frontend Developer',
          sourceCapabilityIds: ['CAP-1'],
        },
        {
          id: 'B',
          name: 'API',
          area: 'backend',
          suggestedRoleKey: 'backend_developer',
          sourceCapabilityIds: ['CAP-1'],
        },
        {
          id: 'C',
          name: 'QA',
          area: 'qa',
          suggestedRoleKey: 'qa_engineer',
          sourceCapabilityIds: ['CAP-2'],
        },
      ],
      roles: [],
      skills: [],
      criticalWorkIds: ['A', 'B', 'C'],
    },
    resource: {},
  };
}

describe('HOW engine contracts (new pipeline)', () => {
  it('roleSkill produces roles and skills', () => {
    const result = portedRoleSkill.runRoleSkillPlanning({}, fixture());
    assert.ok(Array.isArray(result.roles) || Array.isArray(result.planning?.roles) || result.status);
    const applied = portedRoleSkill.applyRoleSkillToContainer(fixture(), result);
    assert.ok(applied.planning);
  });

  it('effort is deterministic for same container', () => {
    const input = fixture();
    const a = portedEffort.runEffortEngine(input);
    const b = portedEffort.runEffortEngine(input);
    assert.equal(a.effort.estimatedHoursTotal, b.effort.estimatedHoursTotal);
    assert.ok(a.effort.estimatedHoursTotal > 0);
  });

  it('CPM runs after effort', () => {
    const input = fixture();
    const effortResult = portedEffort.runEffortEngine(input);
    const withEffort = portedEffort.applyEffortToContainer(input, effortResult);
    const cpm = portedCpm.runSequencingCpm(withEffort);
    assert.ok(cpm);
  });

  it('matching returns shortlists from pool', async () => {
    const input = fixture();
    const poolItems = [
      {
        userId: 'u1',
        jobTitle: 'backend developer',
        capacityRange: { availablePctAvg: 60 },
        skills: ['Node.js', 'React'],
      },
    ];
    const result = await portedMatching.runEmployeeMatching({}, input, { poolItems });
    assert.ok(Array.isArray(result.recommendations));
    assert.ok(result.recommendations.length >= 1);
  });

  it('schedule packs calendar hours', () => {
    const recommendations = [
      {
        taskId: 'A',
        shortlist: [{ userId: 'u1', displayName: 'One', score: 0.9 }],
      },
      {
        taskId: 'B',
        shortlist: [{ userId: 'u1', displayName: 'One', score: 0.9 }],
      },
    ];
    const assignments = portedAssignment.greedyAssignFromShortlists(recommendations);
    const packed = portedSchedule.packScheduleCapacity({
      tasks: [
        { id: 'A', effortHours: 12 },
        { id: 'B', effortHours: 8 },
      ],
      edges: [{ from: 'B', to: 'A' }],
      assignments,
      projectStart: '2026-09-07',
      meetingHoursByUserDay: null,
      calendar: { holidays: [{ date: '2026-09-08' }] },
    });
    assert.ok(Array.isArray(packed.schedule));
    // APS scheduleCapacity exposes criticalPath under completion (see engines/scheduleCapacity.js).
    assert.ok(Array.isArray(packed.completion?.criticalPath));
    assert.ok(packed.completion.criticalPath.length >= 1);
  });

  it('historyOverlapBonus caps at 0.1', () => {
    const bonus = portedMatching.historyOverlapBonus(
      { history: [{ role: 'backend_developer', domain: 'react' }] },
      { suggestedRoleKey: 'backend_developer' },
      new Set(['react'])
    );
    assert.ok(bonus >= 0);
    assert.ok(bonus <= 0.1);
  });
});
