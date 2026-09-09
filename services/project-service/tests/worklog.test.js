const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { isTaskAssignee, collectTaskAssigneeIds } = require('../src/utils/task/taskAssignee');
const {
  isTimeTrackingV1Enabled,
  assertTimeTrackingEnabled,
  normalizeWorklogHours,
  normalizeWorkDate,
  varianceHours,
  sumWorklogHours,
} = require('../src/utils/task/timeTracking');

describe('isTaskAssignee', () => {
  it('matches primary assigneeId', () => {
    assert.equal(isTaskAssignee({ assigneeId: '507f1f77bcf86cd799439011' }, '507f1f77bcf86cd799439011'), true);
    assert.equal(isTaskAssignee({ assigneeId: '507f1f77bcf86cd799439011' }, '507f1f77bcf86cd799439099'), false);
  });

  it('matches assignments[].userId', () => {
    const task = {
      assigneeId: null,
      assignments: [{ userId: '507f1f77bcf86cd799439022' }],
    };
    assert.equal(isTaskAssignee(task, '507f1f77bcf86cd799439022'), true);
    assert.equal(isTaskAssignee(task, '507f1f77bcf86cd799439011'), false);
  });

  it('collectTaskAssigneeIds unions primary + slots', () => {
    const ids = collectTaskAssigneeIds({
      assigneeId: 'a1',
      assignments: [{ userId: 'a2' }, { userId: 'a1' }],
    });
    assert.equal(ids.size, 2);
    assert.ok(ids.has('a1'));
    assert.ok(ids.has('a2'));
  });
});

describe('timeTracking validators', () => {
  it('normalizeWorklogHours accepts 0.25–24', () => {
    assert.equal(normalizeWorklogHours(1), 1);
    assert.equal(normalizeWorklogHours(0.25), 0.25);
    assert.equal(normalizeWorklogHours(24), 24);
    assert.throws(() => normalizeWorklogHours(0), /hours/);
    assert.throws(() => normalizeWorklogHours(25), /hours/);
  });

  it('normalizeWorkDate requires YYYY-MM-DD', () => {
    const d = normalizeWorkDate('2026-09-07');
    assert.equal(d.toISOString().slice(0, 10), '2026-09-07');
    assert.throws(() => normalizeWorkDate(''), /workDate/);
    assert.throws(() => normalizeWorkDate('not-a-date'), /workDate/);
  });

  it('varianceHours = actual − estimate', () => {
    assert.deepEqual(varianceHours(8, 10), {
      estimateHours: 8,
      actualHours: 10,
      varianceHours: 2,
    });
    assert.deepEqual(varianceHours(null, 3), {
      estimateHours: null,
      actualHours: 3,
      varianceHours: null,
    });
  });

  it('sumWorklogHours totals rows', () => {
    assert.equal(sumWorklogHours([{ hours: 1 }, { hours: 2.5 }]), 3.5);
  });

  it('flag off throws TIME_TRACKING_DISABLED', () => {
    const prev = process.env.TIME_TRACKING_V1;
    process.env.TIME_TRACKING_V1 = '0';
    try {
      assert.equal(isTimeTrackingV1Enabled(), false);
      assert.throws(() => assertTimeTrackingEnabled(), (err) => {
        assert.equal(err.errorCode, 'TIME_TRACKING_DISABLED');
        assert.equal(err.statusCode, 404);
        return true;
      });
    } finally {
      if (prev === undefined) delete process.env.TIME_TRACKING_V1;
      else process.env.TIME_TRACKING_V1 = prev;
    }
  });
});

describe('worklog source contracts', () => {
  it('controller ignores body.userId proxy', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/controllers/worklog.controller.js'),
      'utf8'
    );
    assert.ok(src.includes('Self-log only'));
    assert.equal(/userId:\s*body\.userId/.test(src), false);
  });

  it('model has unique (taskId, userId, workDate)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/models/Worklog.js'), 'utf8');
    assert.ok(src.includes("unique: true"));
    assert.ok(src.includes('taskId: 1, userId: 1, workDate: 1'));
  });

  it('service enforces WORKLOG_ASSIGNEE_ONLY', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/worklog.service.js'),
      'utf8'
    );
    assert.ok(src.includes('WORKLOG_ASSIGNEE_ONLY'));
    assert.ok(src.includes('findOneAndUpdate'));
    assert.ok(src.includes('isTaskAssignee'));
  });
});
