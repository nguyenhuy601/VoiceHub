const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mergeOrgDashboardStats } = require('./dashboardSummary.merge');

describe('mergeOrgDashboardStats', () => {
  it('rỗng → failed, không bịa số', () => {
    const out = mergeOrgDashboardStats([]);
    assert.equal(out.failed, true);
    assert.equal(out.taskDone, null);
    assert.equal(out.overdue, 0);
    assert.deepEqual(out.boards, []);
    assert.deepEqual(out.overdueItems, []);
  });

  it('cộng nhiều org và lấy top 5 board theo overdue', () => {
    const out = mergeOrgDashboardStats([
      {
        organizationId: 'a'.repeat(24),
        done: 4,
        openCount: 6,
        overdue: 2,
        dueThisWeek: 1,
        myOpen: 3,
        myOverdue: 1,
        myDueThisWeek: 1,
        membershipRole: 'member',
        boards: [
          { id: '1', name: 'Alpha', total: 10, done: 4, open: 6, overdue: 2 },
          { id: '2', name: 'Beta', total: 3, done: 1, open: 2, overdue: 0 },
        ],
        overdueItems: [
          { id: 't1', title: 'Late A', dueDate: '2026-08-01T00:00:00.000Z', boardId: '1' },
          { id: 't2', title: 'Late B', dueDate: '2026-08-03T00:00:00.000Z', boardId: '2' },
        ],
      },
      {
        organizationId: 'b'.repeat(24),
        done: 1,
        openCount: 4,
        overdue: 3,
        dueThisWeek: 2,
        myOpen: 1,
        myOverdue: 0,
        myDueThisWeek: 1,
        membershipRole: 'owner',
        boards: [{ id: '3', name: 'Gamma', total: 8, done: 1, open: 7, overdue: 5 }],
        overdueItems: Array.from({ length: 6 }, (_, i) => ({
          id: `u${i}`,
          title: `Gamma ${i}`,
          dueDate: `2026-07-0${i + 1}T00:00:00.000Z`,
          boardId: '3',
        })),
      },
    ]);
    assert.equal(out.failed, false);
    assert.equal(out.taskDone, 5);
    assert.equal(out.overdue, 5);
    assert.equal(out.myOpen, 4);
    assert.equal(out.membershipRole, 'member');
    assert.equal(out.boards[0].name, 'Gamma');
    assert.equal(out.boards.length, 3);
    assert.equal(out.overdueItems.length, 8);
    assert.equal(out.overdueItems[0].title, 'Gamma 0');
    assert.equal(out.overdueItems[0].organizationId, 'b'.repeat(24));
  });
});
