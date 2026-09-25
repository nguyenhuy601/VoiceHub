const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runToolsSequence } = require('../src/orchestration/runToolsSequence');
const { runSequencingCpm } = require('../src/engines/sequencingCpm');
const {
  historyOverlapBonus,
  runEmployeeMatching,
} = require('../src/engines/employeeMatching');
const {
  DAILY_CAP_HOURS,
  packScheduleCapacity,
} = require('../src/engines/scheduleCapacity');

function baseContainer() {
  return {
    planning: {
      tasks: [
        { id: 'A', name: 'API', suggestedRoleKey: 'backend', effortHours: 8 },
        { id: 'B', name: 'QA', suggestedRoleKey: 'qa', effortHours: 4 },
      ],
      roles: [],
      skills: [],
    },
    analyses: {
      capability: { items: [] },
      dependency: { edges: [{ from: 'B', to: 'A' }] },
    },
    resource: {},
  };
}

describe('deterministic HOW engines', () => {
  it('effort tool updates tasks and rollup without jobs shells', async () => {
    const output = await runToolsSequence(
      [{ toolName: 'EffortTool', autoConfirm: false }],
      {
        container: baseContainer(),
        snapshotId: 'snap-1',
      }
    );
    assert.equal(output.container.jobs, undefined);
    assert.ok(output.container.planning.effort.estimatedHoursTotal > 0);
  });

  it('CPM preserves dependency semantics and critical path', () => {
    const result = runSequencingCpm(baseContainer());
    assert.equal(result.theoreticalCpm.projectDurationHours, 12);
    assert.deepEqual(result.theoreticalCpm.criticalPath, ['A', 'B']);
  });

  it('matching uses history bonus and filters project-cap employees', async () => {
    assert.equal(
      historyOverlapBonus(
        { history: [{ role: 'backend_developer' }] },
        { suggestedRoleKey: 'backend_developer' },
        new Set()
      ),
      0.06
    );
    const result = await runEmployeeMatching({}, baseContainer(), {
      poolItems: [
        { userId: 'free', jobTitle: 'backend', capacityRemaining: 1 },
        { userId: 'busy', maxConcurrentProjects: 1, activeProjectCount: 1 },
        { userId: 'excluded', jobTitle: 'backend', capacityRemaining: 1 },
        { userId: 'overloaded', jobTitle: 'backend', capacityRemaining: 0.1 },
      ],
      constraints: { excludeEmployeeIds: ['excluded'] },
    });
    assert.equal(result.meta.filteredProjectCap, 2);
    assert.equal(result.recommendations[0].shortlist.some((s) => s.userId === 'excluded'), false);
    const overloaded = result.recommendations[0].shortlist.find((s) => s.userId === 'overloaded');
    assert.ok(overloaded);
    assert.equal(overloaded.overload, true);
    assert.ok(Number.isFinite(overloaded.available_capacity));
    assert.equal(result.recommendations[0].shortlist[0].userId, 'free');
  });

  it('schedule respects daily capacity, dependencies and holidays', () => {
    const packed = packScheduleCapacity({
      tasks: [
        { id: 'A', effortHours: 16 },
        { id: 'B', effortHours: 4 },
      ],
      edges: [{ from: 'B', to: 'A' }],
      assignments: [
        { taskId: 'A', userId: 'u1' },
        { taskId: 'B', userId: 'u2' },
      ],
      projectStart: '2026-09-07',
      calendar: { holidays: ['2026-09-08'] },
    });
    assert.ok(packed.schedule.every((row) => row.usedAfter <= DAILY_CAP_HOURS));
    assert.equal(packed.schedule.some((row) => row.dateKey === '2026-09-08'), false);
    assert.equal(packed.taskDates.A.startDate, '2026-09-07');
    assert.equal(packed.taskDates.B.startDate, '2026-09-09');
  });

  it('runs the production ScheduleTool with nullable meeting input', async () => {
    const container = baseContainer();
    container.resource.recommendations = [
      {
        taskId: 'A',
        shortlist: [{ userId: 'u1', score: 1 }],
      },
      {
        taskId: 'B',
        shortlist: [{ userId: 'u2', score: 1 }],
      },
    ];
    const output = await runToolsSequence(
      [{ toolName: 'ScheduleTool', autoConfirm: false }],
      {
        container,
        pack: { overview: { startDate: '2026-09-07' } },
        toolData: { meetingHoursByUserDay: null },
        snapshotId: 'snap-schedule',
      }
    );
    assert.equal(output.container.jobs, undefined);
    assert.ok(output.container.resource.schedule.length > 0);
  });
});
