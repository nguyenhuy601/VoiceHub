/**
 * Effort ≠ Duration — scheduleCapacity materializes startDate/dueDate.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  packScheduleCapacity,
  applyScheduleCapacityToContainer,
  buildExecutionPlanFromContainer,
  runScheduleCapacity,
} = require('../src/utils/aiAnalysis/aiAnalysisScheduleCapacity');
const { mapBlueprintTasksToImportPlan } = require('../src/utils/aiAnalysis/aiAnalysisBlueprintImport');
const { createEmptyAiAnalysisContainer } = require('../src/utils/aiAnalysis/aiAnalysisContainer');

describe('aiAnalysisScheduleCapacity dates (effort → calendar)', () => {
  it('12h effort @ full 8h/day spans 2 weekdays', () => {
    const { schedule, taskDates, completion } = packScheduleCapacity({
      tasks: [{ id: 'T1', effortHours: 12 }],
      edges: [],
      assignments: [{ taskId: 'T1', userId: 'u1' }],
      projectStart: '2026-09-07', // Monday
    });

    assert.equal(taskDates.T1.startDate, '2026-09-07');
    assert.equal(taskDates.T1.dueDate, '2026-09-08');
    assert.equal(completion.projectStart, '2026-09-07');
    assert.equal(completion.estimatedEnd, '2026-09-08');
    assert.equal(completion.totalEffortHours, 12);
    assert.equal(schedule.length, 2);
  });

  it('12h effort with 4h meetings/day spans 3 weekdays', () => {
    const { taskDates, completion } = packScheduleCapacity({
      tasks: [{ id: 'T1', effortHours: 12 }],
      edges: [],
      assignments: [{ taskId: 'T1', userId: 'u1' }],
      projectStart: '2026-09-07',
      meetingHoursByUserDay: {
        'u1|2026-09-07': 4,
        'u1|2026-09-08': 4,
        'u1|2026-09-09': 4,
      },
    });

    assert.equal(taskDates.T1.startDate, '2026-09-07');
    assert.equal(taskDates.T1.dueDate, '2026-09-09');
    assert.equal(completion.estimatedEnd, '2026-09-09');
  });

  it('FS dependency pushes successor start after predecessor due', () => {
    const { taskDates } = packScheduleCapacity({
      tasks: [
        { id: 'A', effortHours: 8 },
        { id: 'B', effortHours: 4 },
      ],
      edges: [{ from: 'B', to: 'A' }],
      assignments: [
        { taskId: 'A', userId: 'u1' },
        { taskId: 'B', userId: 'u2' },
      ],
      projectStart: '2026-09-07',
    });

    assert.equal(taskDates.A.dueDate, '2026-09-07');
    assert.ok(taskDates.B.startDate >= taskDates.A.dueDate);
  });

  it('applyScheduleCapacityToContainer patches planning.tasks start/due', () => {
    const container = {
      planning: {
        tasks: [
          { id: 'T1', name: 'One', effortHours: 12 },
          { id: 'T2', name: 'Unassigned', effortHours: 4 },
        ],
      },
      resource: {},
      analyses: { dependency: { edges: [] } },
    };
    const result = runScheduleCapacity(container, {
      assignments: [{ taskId: 'T1', userId: 'u1' }],
      projectStart: '2026-09-07',
    });
    const next = applyScheduleCapacityToContainer(container, result);
    const t1 = next.planning.tasks.find((t) => t.id === 'T1');
    const t2 = next.planning.tasks.find((t) => t.id === 'T2');
    assert.equal(t1.startDate, '2026-09-07');
    assert.equal(t1.dueDate, '2026-09-08');
    assert.equal(t2.startDate, null);
    assert.equal(t2.dueDate, null);
  });

  it('buildExecutionPlanFromContainer works include startDate/dueDate', () => {
    const container = {
      planning: {
        completion: {
          projectStart: '2026-09-07',
          estimatedEnd: '2026-09-08',
          totalEffortHours: 12,
          criticalPath: ['T1'],
        },
      },
      resource: {
        schedule: [
          { taskId: 'T1', userId: 'u1', dateKey: '2026-09-07', hours: 8 },
          { taskId: 'T1', userId: 'u1', dateKey: '2026-09-08', hours: 4 },
        ],
        assignments: [{ taskId: 'T1', userId: 'u1' }],
      },
    };
    const plan = buildExecutionPlanFromContainer(container);
    assert.equal(plan.works.length, 1);
    assert.equal(plan.works[0].startDate, '2026-09-07');
    assert.equal(plan.works[0].dueDate, '2026-09-08');
  });

  it('mapBlueprintTasksToImportPlan maps startDate/dueDate onto rows', () => {
    const base = createEmptyAiAnalysisContainer();
    base.jobs.projectPlan = { ...base.jobs.projectPlan, status: 'confirmed' };
    base.planning.tasks = [
      {
        id: 'T1',
        name: 'Scheduled',
        effortHours: 12,
        startDate: '2026-09-07',
        dueDate: '2026-09-08',
      },
      { id: 'T2', name: 'From schedule only', effortHours: 4 },
    ];
    base.resource.schedule = [
      { taskId: 'T2', userId: 'u1', dateKey: '2026-09-09', hours: 4 },
    ];
    base.resource.assignments = [
      { taskId: 'T1', userId: 'u1' },
      { taskId: 'T2', userId: 'u1' },
    ];

    const { rows } = mapBlueprintTasksToImportPlan(base);
    const r1 = rows.find((r) => r.blueprintTaskId === 'T1');
    const r2 = rows.find((r) => r.blueprintTaskId === 'T2');
    assert.equal(r1.startDate, '2026-09-07');
    assert.equal(r1.dueDate, '2026-09-08');
    assert.equal(r2.startDate, '2026-09-09');
    assert.equal(r2.dueDate, '2026-09-09');
  });
});
