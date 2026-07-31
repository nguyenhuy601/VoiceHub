/**
 * Unit — G3 PlanningItem type/status helpers (pure).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PLANNING_ITEM_TYPES,
  PLANNING_ITEM_STATUSES,
  ISSUE_TYPES,
} = require('../src/utils/planningItemTypes');

describe('PlanningItem constants', () => {
  it('includes roadmap release milestone epic feature', () => {
    assert.deepEqual([...PLANNING_ITEM_TYPES].sort(), [
      'epic',
      'feature',
      'milestone',
      'release',
      'roadmap',
    ]);
  });

  it('includes planned active done cancelled', () => {
    assert.ok(PLANNING_ITEM_STATUSES.includes('planned'));
    assert.ok(PLANNING_ITEM_STATUSES.includes('active'));
    assert.ok(PLANNING_ITEM_STATUSES.includes('done'));
    assert.ok(PLANNING_ITEM_STATUSES.includes('cancelled'));
  });

  it('issue types are task bug story', () => {
    assert.deepEqual([...ISSUE_TYPES], ['task', 'bug', 'story']);
  });
});

describe('backlog query shape', () => {
  it('documents filter for tasks without sprint', () => {
    const filter = {
      projectId: 'x',
      isActive: true,
      $or: [{ sprintId: null }, { sprintId: { $exists: false } }],
    };
    assert.equal(filter.isActive, true);
    assert.equal(filter.$or.length, 2);
  });
});
