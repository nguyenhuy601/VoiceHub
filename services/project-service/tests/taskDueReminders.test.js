const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyTaskDueReminder,
  dueDatesEqual,
  startOfUtcDay,
} = require('../src/utils/task/taskDueReminder');
const { buildActionUrl } = require('../src/jobs/taskDueReminders.job');

describe('classifyTaskDueReminder', () => {
  const now = new Date(Date.UTC(2026, 8, 7)); // 2026-09-07

  it('returns overdue when dueDate before today and not yet notified', () => {
    const kind = classifyTaskDueReminder(
      {
        dueDate: new Date(Date.UTC(2026, 8, 5)),
        status: 'todo',
        overdueNotifiedAt: null,
      },
      { now, dueSoonDays: 2 }
    );
    assert.equal(kind, 'overdue');
  });

  it('skips overdue when already notified', () => {
    const kind = classifyTaskDueReminder(
      {
        dueDate: new Date(Date.UTC(2026, 8, 5)),
        status: 'in_progress',
        overdueNotifiedAt: now,
      },
      { now, dueSoonDays: 2 }
    );
    assert.equal(kind, null);
  });

  it('returns due_soon within window', () => {
    const kind = classifyTaskDueReminder(
      {
        dueDate: new Date(Date.UTC(2026, 8, 8)),
        status: 'todo',
        dueSoonNotifiedAt: null,
      },
      { now, dueSoonDays: 2 }
    );
    assert.equal(kind, 'due_soon');
  });

  it('skips done / cancelled / inactive', () => {
    assert.equal(
      classifyTaskDueReminder(
        { dueDate: new Date(Date.UTC(2026, 8, 5)), status: 'done' },
        { now, dueSoonDays: 2 }
      ),
      null
    );
    assert.equal(
      classifyTaskDueReminder(
        { dueDate: new Date(Date.UTC(2026, 8, 5)), status: 'cancelled' },
        { now, dueSoonDays: 2 }
      ),
      null
    );
    assert.equal(
      classifyTaskDueReminder(
        { dueDate: new Date(Date.UTC(2026, 8, 5)), status: 'todo', isActive: false },
        { now, dueSoonDays: 2 }
      ),
      null
    );
  });

  it('skips far-future due dates', () => {
    assert.equal(
      classifyTaskDueReminder(
        {
          dueDate: new Date(Date.UTC(2026, 8, 20)),
          status: 'todo',
          dueSoonNotifiedAt: null,
        },
        { now, dueSoonDays: 2 }
      ),
      null
    );
  });
});

describe('dueDatesEqual / buildActionUrl', () => {
  it('compares UTC days', () => {
    assert.equal(
      dueDatesEqual(new Date('2026-09-07T01:00:00.000Z'), new Date('2026-09-07T23:00:00.000Z')),
      true
    );
    assert.equal(dueDatesEqual(new Date('2026-09-07'), new Date('2026-09-08')), false);
    assert.equal(dueDatesEqual(null, null), true);
    assert.equal(startOfUtcDay('2026-09-07T12:00:00.000Z').toISOString().slice(0, 10), '2026-09-07');
  });

  it('builds workItem deep link', () => {
    assert.equal(
      buildActionUrl('proj1', 'task1'),
      '/app/collaborate/projects/proj1?workItem=task1'
    );
    assert.equal(buildActionUrl('', 'task1'), '/app/collaborate/projects');
  });
});
