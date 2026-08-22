/**
 * Unit — planningStatusToListId / listIdToPlanningStatus (Feature on board).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  planningStatusToListId,
  listIdToPlanningStatus,
  resolveFeatureBoardListId,
  resolveFeatureDisplaySprintId,
} = require('../src/utils/planningBoardStatus');

const LISTS = [
  { _id: 'l-todo', title: 'Todo', statusKey: 'todo', order: 1 },
  { _id: 'l-doing', title: 'In Progress', statusKey: 'doing', order: 2 },
  { _id: 'l-review', title: 'Review', statusKey: 'review', order: 3 },
  { _id: 'l-done', title: 'Done', statusKey: 'done', order: 4 },
];

describe('planningStatusToListId', () => {
  it('maps legacy planned → todo list', () => {
    assert.equal(planningStatusToListId('planned', LISTS), 'l-todo');
  });

  it('maps legacy active → doing list', () => {
    assert.equal(planningStatusToListId('active', LISTS), 'l-doing');
  });

  it('maps workflow key doing → doing list', () => {
    assert.equal(planningStatusToListId('doing', LISTS), 'l-doing');
  });

  it('maps review → review list', () => {
    assert.equal(planningStatusToListId('review', LISTS), 'l-review');
  });

  it('maps done → done list', () => {
    assert.equal(planningStatusToListId('done', LISTS), 'l-done');
  });

  it('falls back to first option when unknown', () => {
    assert.equal(planningStatusToListId('???', LISTS), 'l-todo');
  });

  it('returns empty when no lists', () => {
    assert.equal(planningStatusToListId('todo', []), '');
  });
});

describe('listIdToPlanningStatus', () => {
  it('returns statusKey of target list', () => {
    assert.equal(listIdToPlanningStatus('l-doing', LISTS), 'doing');
    assert.equal(listIdToPlanningStatus('l-todo', LISTS), 'todo');
  });

  it('returns empty for unknown list', () => {
    assert.equal(listIdToPlanningStatus('missing', LISTS), '');
  });
});

describe('resolveFeatureBoardListId', () => {
  it('maps status and never returns empty when lists exist', () => {
    assert.equal(resolveFeatureBoardListId('doing', LISTS), 'l-doing');
    assert.equal(resolveFeatureBoardListId('planned', LISTS), 'l-todo');
    assert.ok(resolveFeatureBoardListId('???', LISTS));
  });

  it('fallback todo / first order when map empty lists with no statusKey', () => {
    const bare = [
      { _id: 'a', title: 'Alpha', order: 2 },
      { _id: 'b', title: 'Beta', order: 1 },
    ];
    assert.equal(resolveFeatureBoardListId('planned', bare), 'b');
  });
});

describe('resolveFeatureDisplaySprintId', () => {
  it('keeps own sprintId', () => {
    assert.equal(resolveFeatureDisplaySprintId('s-own', 'f1', [{ featureId: 'f1', sprintId: 's1' }]), 's-own');
  });

  it('picks majority child sprint', () => {
    assert.equal(
      resolveFeatureDisplaySprintId(null, 'f1', [
        { featureId: 'f1', sprintId: 's1' },
        { featureId: 'f1', sprintId: 's2' },
        { featureId: 'f1', sprintId: 's1' },
      ]),
      's1'
    );
  });

  it('returns null when no own sprint and no children', () => {
    assert.equal(resolveFeatureDisplaySprintId(null, 'f1', []), null);
  });
});

describe('feature dueDate fallback', () => {
  it('documents dueDate || targetDate', () => {
    const resolveDue = (f) => f.dueDate || f.targetDate || null;
    assert.equal(resolveDue({ dueDate: '2026-01-01', targetDate: '2026-02-01' }), '2026-01-01');
    assert.equal(resolveDue({ dueDate: null, targetDate: '2026-02-01' }), '2026-02-01');
    assert.equal(resolveDue({}), null);
  });
});
