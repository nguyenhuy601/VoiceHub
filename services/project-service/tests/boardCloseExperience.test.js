const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildClosedBoardExperiences,
  monthsBetweenDates,
} = require('../src/utils/project/boardCloseExperience');

describe('boardCloseExperience', () => {
  it('monthsBetweenDates uses real UTC dates only', () => {
    assert.equal(monthsBetweenDates('2026-01-15', '2026-03-10'), 3);
    assert.equal(monthsBetweenDates(null, '2026-03-10'), undefined);
    assert.equal(monthsBetweenDates('2026-06-01', '2026-01-01'), undefined);
  });

  it('sets months when board has startDate and dueDate', () => {
    const rows = buildClosedBoardExperiences({
      board: {
        _id: 'b1',
        title: 'Demo',
        startDate: '2026-01-01',
        dueDate: '2026-04-15',
      },
      memberships: [{ userId: 'u1', projectRoleId: 'r1' }],
      roles: [{ _id: 'r1', key: 'backend_developer', label: 'Backend' }],
      tasks: [
        { assigneeId: 'u1', status: 'done', completedAt: new Date('2026-02-01') },
        { assigneeId: 'u1', status: 'todo' },
      ],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'closed_board');
    assert.equal(rows[0].months, 4);
    assert.equal(rows[0].year, 2026);
  });

  it('omits months when start date missing', () => {
    const rows = buildClosedBoardExperiences({
      board: { _id: 'b2', title: 'Short', dueDate: '2026-04-15' },
      memberships: [{ userId: 'u1', projectRoleId: 'r1' }],
      roles: [{ _id: 'r1', key: 'qa', label: 'QA' }],
      tasks: [{ assigneeId: 'u1', status: 'done' }],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].months, undefined);
  });
});
