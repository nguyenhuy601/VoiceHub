const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectOverviewAggregate,
  computeHubBoardSummary,
  countIssuesByStatusBucket,
  classifyListStatusBucket,
} = require('../src/utils/projectOverviewAggregate');

const lists = [
  { _id: 'l1', title: 'Todo', statusKey: 'todo' },
  { _id: 'l2', title: 'In Progress', statusKey: 'in_progress' },
  { _id: 'l3', title: 'Done', statusKey: 'done' },
];

describe('projectOverviewAggregate', () => {
  it('computeHubBoardSummary parity basic', () => {
    const cards = [
      { _id: '1', listId: 'l1', status: 'todo', dueDate: '2020-01-01' },
      { _id: '2', listId: 'l2', status: 'in_progress' },
      { _id: '3', listId: 'l3', status: 'done' },
      { _id: '4', listId: 'l2', status: 'in_review' },
    ];
    const summary = computeHubBoardSummary(cards, lists);
    assert.equal(summary.total, 4);
    assert.equal(summary.done, 1);
    assert.equal(summary.inReview, 1);
    assert.equal(summary.overdue, 1);
    assert.equal(summary.donePercent, 25);
  });

  it('buildProjectOverviewAggregate charts + health', () => {
    const cards = [
      { _id: '1', listId: 'l1', status: 'todo', issueType: 'task', priority: 'high', assigneeId: 'u1', assigneeName: 'A' },
      { _id: '2', listId: 'l2', status: 'in_progress', issueType: 'bug', priority: 'medium', assigneeId: 'u2', assigneeName: 'B' },
      { _id: '3', listId: 'l3', status: 'done', issueType: 'story' },
    ];
    const out = buildProjectOverviewAggregate({
      cards,
      lists,
      priorityConfig: { items: [{ key: 'high', label: 'High' }, { key: 'medium', label: 'Medium' }] },
      projectCode: 'PRJ',
      sprints: [{ _id: 's1', status: 'active', name: 'Sprint 1', createdAt: '2026-01-01' }],
      planningRows: [{ type: 'epic' }, { type: 'feature' }],
    });
    assert.equal(out.summary.total, 3);
    assert.equal(out.charts.byType.bug, 1);
    assert.equal(out.charts.byStatus.progress, 1);
    assert.ok(Array.isArray(out.nextActions));
    assert.equal(out.activeSprint?.name, 'Sprint 1');
    assert.equal(out.planningPulse.epic, 1);
    assert.equal(out.planningPulse.feature, 1);
  });

  it('summary-only informationLevel empty metrics', () => {
    const out = buildProjectOverviewAggregate({
      cards: [{ _id: '1', listId: 'l1' }],
      lists,
      informationLevel: 'summary',
    });
    assert.equal(out.summary.total, 0);
    assert.deepEqual(out.charts.byStatus, { todo: 0, progress: 0, done: 0 });
    assert.deepEqual(out.healthPreview.overdue, []);
  });

  it('classifyListStatusBucket', () => {
    assert.equal(classifyListStatusBucket('done'), 'done');
    assert.equal(classifyListStatusBucket({ statusKey: 'in_review' }), 'progress');
    assert.equal(countIssuesByStatusBucket([{ listId: 'l1' }], lists).todo, 1);
  });
});
