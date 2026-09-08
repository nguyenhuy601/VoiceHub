const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyDue } = require('../src/utils/taskDueClassify');

const HOUR = 60 * 60 * 1000;

describe('classifyDue', () => {
  const now = new Date('2026-09-08T10:00:00.000Z');

  it('overdue khi dueDate trước now', () => {
    assert.equal(
      classifyDue({ dueDate: new Date('2026-09-08T09:59:00.000Z'), now, soonMs: 24 * HOUR }),
      'overdue'
    );
  });

  it('due_soon trong cửa sổ', () => {
    assert.equal(
      classifyDue({ dueDate: new Date('2026-09-09T09:00:00.000Z'), now, soonMs: 24 * HOUR }),
      'due_soon'
    );
  });

  it('null khi còn xa hoặc thiếu ngày', () => {
    assert.equal(
      classifyDue({ dueDate: new Date('2026-09-20T00:00:00.000Z'), now, soonMs: 24 * HOUR }),
      null
    );
    assert.equal(classifyDue({ dueDate: null, now, soonMs: 24 * HOUR }), null);
  });
});
