const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runHowJob } = require('../src/engines/howJobRunner');
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
    jobs: {},
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
  it('effort runner updates tasks, rollup and evidence', async () => {
    const output = await runHowJob({
      job: 'effortRoleAnalysis',
      container: baseContainer(),
      snapshotId: 'snap-1',
    });
    assert.equal(output.container.jobs.effortRoleAnalysis.status, 'ready');
    assert.ok(output.container.planning.effort.estimatedHoursTotal > 0);
    assert.equal(output.evidence[0].snapshotId, 'snap-1');
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
      ],
    });
    assert.equal(result.meta.filteredProjectCap, 2);
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

  it('runs the production scheduleCapacity branch with nullable meeting input', async () => {
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
    const output = await runHowJob({
      job: 'scheduleCapacity',
      container,
      toolData: { meetingHoursByUserDay: null },
      snapshotId: 'snap-schedule',
    });
    assert.equal(output.container.jobs.scheduleCapacity.status, 'ready');
    assert.ok(output.container.resource.schedule.length > 0);
    assert.equal(
      typeof output.container.jobs.scheduleCapacity.durationMs,
      'number'
    );
  });
});
