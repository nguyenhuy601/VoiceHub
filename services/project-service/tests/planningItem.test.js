/**
 * Unit — G3 PlanningItem type/status helpers (pure).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PLANNING_ITEM_TYPES,
  PLANNING_ITEM_STATUSES,
  ISSUE_TYPES,
  slugPlanningStatusKey,
  normalizePlanningStatus,
  normalizePlanningPriority,
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

describe('normalizePlanningStatus', () => {
  it('keeps legacy planned/active/done/cancelled', () => {
    assert.equal(normalizePlanningStatus('planned'), 'planned');
    assert.equal(normalizePlanningStatus('ACTIVE'), 'active');
    assert.equal(normalizePlanningStatus('done'), 'done');
    assert.equal(normalizePlanningStatus('cancelled'), 'cancelled');
  });

  it('accepts board statusKey todo/doing/review', () => {
    assert.equal(normalizePlanningStatus('todo'), 'todo');
    assert.equal(normalizePlanningStatus('Doing'), 'doing');
    assert.equal(normalizePlanningStatus('in progress'), 'in_progress');
  });

  it('garbage falls back', () => {
    assert.equal(normalizePlanningStatus('???', 'planned'), 'planned');
    assert.equal(normalizePlanningStatus('', 'active'), 'active');
    assert.equal(slugPlanningStatusKey(' To Do '), 'to_do');
  });
});

describe('normalizePlanningPriority', () => {
  it('slugs catalog keys', () => {
    assert.equal(normalizePlanningPriority('HIGH'), 'high');
    assert.equal(normalizePlanningPriority('medium'), 'medium');
  });

  it('empty falls back to medium', () => {
    assert.equal(normalizePlanningPriority(''), 'medium');
    assert.equal(normalizePlanningPriority(null, 'urgent'), 'urgent');
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
