process.env.ORGANIZATION_SERVICE_URL =
  process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3011';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatStatusCounts,
  buildDashboardVisibilityMatch,
  dashboardDateWindow,
  utcDayStart,
  DONE_STATUSES,
  formatOverdueItems,
  OVERDUE_ITEMS_LIMIT,
} = require('../src/services/taskStatistics.helpers');

describe('taskStatistics dashboard helpers', () => {
  it('formatStatusCounts cộng total từ các status hợp lệ', () => {
    const out = formatStatusCounts([
      { _id: 'todo', count: 2 },
      { _id: 'done', count: 3 },
      { _id: 'unknown', count: 9 },
    ]);
    assert.equal(out.todo, 2);
    assert.equal(out.done, 3);
    assert.equal(out.total, 5);
    assert.equal(out.review, 0);
  });

  it('dashboardDateWindow: 7 ngày UTC từ 00:00 hôm nay', () => {
    const now = new Date('2026-08-08T15:30:00.000Z');
    const { startToday, endWeek } = dashboardDateWindow(now);
    assert.equal(startToday.toISOString(), '2026-08-08T00:00:00.000Z');
    assert.equal(endWeek.toISOString(), '2026-08-15T00:00:00.000Z');
    assert.equal(utcDayStart(now).toISOString(), startToday.toISOString());
  });

  it('DONE_STATUSES không gồm việc đang mở', () => {
    assert.deepEqual(DONE_STATUSES, ['done', 'cancelled']);
  });

  it('buildDashboardVisibilityMatch self: assignee hoặc createdBy', () => {
    const uid = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const match = buildDashboardVisibilityMatch({ visibility: 'self' }, uid);
    assert.equal(match.isActive, true);
    assert.ok(Array.isArray(match.$or));
    const keys = match.$or.map((c) => Object.keys(c)[0]).sort();
    assert.deepEqual(keys, ['assigneeId', 'createdBy']);
  });

  it('buildDashboardVisibilityMatch team: thêm ownerTeamId song song teamId', () => {
    const teamId = '6a4e1f3c0e89d4e25c7bdcac';
    const match = buildDashboardVisibilityMatch(
      {
        visibility: 'team',
        teamIds: [teamId],
        assignableUserIds: [],
      },
      'aaaaaaaaaaaaaaaaaaaaaaaa'
    );
    assert.ok(match.$or.some((c) => c.teamId));
    assert.ok(match.$or.some((c) => c.ownerTeamId));
  });

  it('buildDashboardVisibilityMatch org: không thu hẹp theo người', () => {
    const match = buildDashboardVisibilityMatch({ visibility: 'org' }, 'aaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(match.isActive, true);
    assert.equal(match.$or, undefined);
    assert.equal(match.assigneeId, undefined);
  });

  it('formatOverdueItems map title board và bỏ hàng thiếu id', () => {
    const titles = new Map([['bbbbbbbbbbbbbbbbbbbbbbbb', 'Alpha']]);
    const out = formatOverdueItems(
      [
        {
          _id: 'cccccccccccccccccccccccc',
          title: '  Trễ A  ',
          dueDate: '2026-08-01T00:00:00.000Z',
          boardId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          assigneeId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
          organizationId: 'dddddddddddddddddddddddd',
        },
        { title: 'no-id' },
      ],
      titles,
      'dddddddddddddddddddddddd'
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].title, 'Trễ A');
    assert.equal(out[0].boardName, 'Alpha');
    assert.equal(OVERDUE_ITEMS_LIMIT, 8);
  });
});
