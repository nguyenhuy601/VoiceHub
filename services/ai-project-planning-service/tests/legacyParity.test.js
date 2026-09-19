const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const portedRoleSkill = require('../src/engines/roleSkill');
const portedEffort = require('../src/engines/effort');
const portedCpm = require('../src/engines/sequencingCpm');
const portedMatching = require('../src/engines/employeeMatching');
const portedAssignment = require('../src/engines/assignment');
const portedSchedule = require('../src/engines/scheduleCapacity');

const legacyRoot = '../../project-service/src/utils/aiAnalysis';
const legacyRoleSkill = require(`${legacyRoot}/aiAnalysisRoleSkill`);
const legacyEffort = require(`${legacyRoot}/aiAnalysisEffort`);
const legacyCpm = require(`${legacyRoot}/aiAnalysisSequencingCpm`);
const legacyMatching = require(`${legacyRoot}/aiAnalysisMatching`);
const legacyAssignment = require(`${legacyRoot}/aiAnalysisAssignment`);
const legacySchedule = require(`${legacyRoot}/aiAnalysisScheduleCapacity`);

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
        entities: [
          { sensitivity: 'pii', attributes: [{ name: 'email' }] },
        ],
      },
      architectureImpact: {
        items: [{ layer: 'frontend' }, { layer: 'deployment' }],
      },
      dependency: {
        edges: [
          { from: 'B', to: 'A', critical: true, type: 'external' },
          { from: 'C', to: 'B' },
          { from: 'MISSING', to: 'A' },
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

function omitGeneratedAt(result) {
  const clone = structuredClone(result);
  delete clone.generatedAt;
  return clone;
}

describe('legacy deterministic HOW parity', () => {
  it('matches role/skill normalization, dedupe, warnings and source priority', () => {
    const input = fixture();
    assert.deepEqual(
      omitGeneratedAt(portedRoleSkill.runRoleSkillPlanning({}, input)),
      omitGeneratedAt(legacyRoleSkill.runRoleSkillPlanning({}, input))
    );
  });

  it('matches effort and CPM including comparison metadata', () => {
    const input = fixture();
    const legacyEffortResult = legacyEffort.runEffortEngine(input);
    const portedEffortResult = portedEffort.runEffortEngine(input);
    assert.deepEqual(
      omitGeneratedAt(portedEffortResult),
      omitGeneratedAt(legacyEffortResult)
    );
    const effortContainer = portedEffort.applyEffortToContainer(input, portedEffortResult);
    assert.deepEqual(
      omitGeneratedAt(portedCpm.runSequencingCpm(effortContainer)),
      omitGeneratedAt(legacyCpm.runSequencingCpm(effortContainer))
    );
  });

  it('matches matching capacity, seniority, history, penalties and reasons', async () => {
    const input = fixture();
    const poolItems = [
      {
        userId: 'u1',
        jobTitle: 'backend developer',
        capacityRange: { availablePctAvg: 60 },
        capability: {
          seniorityBand: 'lead',
          skills: ['Node.js', 'React'],
          projectExperiences: [{ role: 'backend_developer', domain: 'node.js' }],
        },
      },
      {
        userId: 'u2',
        jobTitle: 'qa engineer',
        availablePct: 90,
        skills: ['QA'],
      },
    ];
    assert.deepEqual(
      omitGeneratedAt(
        await portedMatching.runEmployeeMatching({}, input, { poolItems })
      ),
      omitGeneratedAt(
        await legacyMatching.runEmployeeMatching({}, input, { poolItems })
      )
    );
  });

  it('matches greedy assignment and calendar schedule output', () => {
    const recommendations = [
      {
        taskId: 'A',
        shortlist: [
          { userId: 'u1', displayName: 'One', score: 0.9 },
          { userId: 'u2', displayName: 'Two', score: 0.8 },
        ],
      },
      {
        taskId: 'B',
        shortlist: [{ userId: 'u1', displayName: 'One', score: 0.9 }],
      },
    ];
    assert.deepEqual(
      portedAssignment.greedyAssignFromShortlists(recommendations),
      legacyAssignment.greedyAssignFromShortlists(recommendations)
    );
    const args = {
      tasks: [
        { id: 'A', effortHours: 12 },
        { id: 'B', effortHours: 8 },
      ],
      edges: [{ from: 'B', to: 'A' }],
      assignments: portedAssignment.greedyAssignFromShortlists(recommendations),
      projectStart: '2026-09-07',
      meetingHoursByUserDay: null,
      calendar: { holidays: [{ date: '2026-09-08' }] },
    };
    assert.deepEqual(
      portedSchedule.packScheduleCapacity(args),
      legacySchedule.packScheduleCapacity(args)
    );
  });

  it('matches NFKC and soft-hyphen skill normalization exactly', () => {
    const input = fixture();
    input.analyses.capability.items[0].requiredSkills = [
      'Ｒｅａｃｔ',
      'Node\u00AD.js',
    ];
    assert.deepEqual(
      omitGeneratedAt(portedRoleSkill.runRoleSkillPlanning({}, input)),
      omitGeneratedAt(legacyRoleSkill.runRoleSkillPlanning({}, input))
    );
  });

  it('does not award domain overlap for an empty history domain', () => {
    const item = { history: [{ domain: '' }] };
    const task = { suggestedRoleKey: '' };
    const needs = new Set(['node.js']);
    assert.equal(portedMatching.historyOverlapBonus(item, task, needs), 0);
    assert.equal(
      portedMatching.historyOverlapBonus(item, task, needs),
      legacyMatching.historyOverlapBonus(item, task, needs)
    );
  });
});
