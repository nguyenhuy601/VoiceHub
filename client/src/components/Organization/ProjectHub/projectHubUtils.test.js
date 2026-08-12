import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertCanStartSprint,
  buildIssueOverlay,
  buildSprintMemberIdsBySprintId,
  classifyListStatusBucket,
  collectIssueMemberIds,
  countCardsByIssueType,
  countIssuesByStatusBucket,
  defaultSprintDateRange,
  displayIssueKey,
  dueDateTone,
  isCardInSprint,
  isSprintDateRangeInvalid,
  isProjectDateRangeInvalid,
  mergeIssueWithOverlay,
  normalizeIssueType,
  parseHubDate,
  resolveActiveSprint,
  resolveViewerActiveSprint,
} from './projectHubUtils.js';

test('countCardsByIssueType nhóm story / task / bug', () => {
  const counts = countCardsByIssueType([
    { issueType: 'story' },
    { issueType: 'Story' },
    { issueType: 'bug' },
    { type: 'task' },
    { title: 'no type' },
    { issueType: 'epic' },
  ]);
  assert.equal(counts.story, 2);
  assert.equal(counts.bug, 1);
  assert.equal(counts.task, 2);
  assert.equal(counts.other, 1);
});

test('normalizeIssueType: feature → story', () => {
  assert.equal(normalizeIssueType('feature'), 'story');
  assert.equal(normalizeIssueType('Story'), 'story');
  assert.equal(normalizeIssueType('bug'), 'bug');
  assert.equal(normalizeIssueType(''), 'task');
});

test('displayIssueKey dùng projectCode + 4 ký tự id', () => {
  assert.equal(displayIssueKey('HKT', '64f0abc12345'), 'HKT-2345');
  assert.equal(displayIssueKey('', 'xyz'), 'VH-0000');
});

test('mergeIssueWithOverlay bổ sung type/epic/estimate khi board DTO thiếu', () => {
  const overlay = buildIssueOverlay([
    { _id: 'a1', issueType: 'story', epicId: 'e1', estimateHours: 3 },
  ]);
  const merged = mergeIssueWithOverlay({ _id: 'a1', title: 'T1' }, overlay);
  assert.equal(merged.issueType, 'story');
  assert.equal(String(merged.epicId), 'e1');
  assert.equal(merged.estimateHours, 3);
  const keep = mergeIssueWithOverlay(
    { _id: 'a1', issueType: 'bug', title: 'T1' },
    overlay
  );
  assert.equal(keep.issueType, 'bug');
});

test('countIssuesByStatusBucket todo / progress / done', () => {
  const lists = [
    { _id: 'l1', statusKey: 'todo', title: 'To Do' },
    { _id: 'l2', statusKey: 'in_progress', title: 'In Progress' },
    { _id: 'l3', statusKey: 'done', title: 'Done' },
  ];
  const counts = countIssuesByStatusBucket(
    [
      { listId: 'l1' },
      { listId: 'l2' },
      { listId: 'l3' },
      { status: 'complete' },
    ],
    lists
  );
  assert.equal(counts.todo, 1);
  assert.equal(counts.progress, 1);
  assert.equal(counts.done, 2);
});

test('classifyListStatusBucket và dueDateTone', () => {
  assert.equal(classifyListStatusBucket('In Review'), 'progress');
  assert.equal(classifyListStatusBucket({ statusKey: 'done' }), 'done');
  const past = new Date(Date.now() - 86400000).toISOString();
  const soon = new Date(Date.now() + 3600000).toISOString();
  assert.equal(dueDateTone(past, 'todo'), 'overdue');
  assert.equal(dueDateTone(soon, 'todo'), 'soon');
  assert.equal(dueDateTone(past, 'done'), 'none');
});

test('parseHubDate: invalid → null', () => {
  assert.equal(parseHubDate(''), null);
  assert.equal(parseHubDate('not-a-date'), null);
  assert.ok(parseHubDate('2026-01-01T00:00:00.000Z') instanceof Date);
});

test('defaultSprintDateRange: giữ cặp hợp lệ; thiếu → +14d; start>=end error', () => {
  const kept = defaultSprintDateRange({
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-14T00:00:00.000Z',
  });
  assert.equal(kept.startDate, '2026-01-01T00:00:00.000Z');
  assert.equal(kept.endDate, '2026-01-14T00:00:00.000Z');

  const now = Date.parse('2026-08-11T00:00:00.000Z');
  const filled = defaultSprintDateRange({}, now);
  assert.equal(filled.startDate, '2026-08-11T00:00:00.000Z');
  assert.equal(filled.endDate, '2026-08-25T00:00:00.000Z');

  const onlyStart = defaultSprintDateRange({ startDate: '2026-01-01T00:00:00.000Z' }, now);
  assert.equal(onlyStart.endDate, '2026-01-15T00:00:00.000Z');

  const onlyEnd = defaultSprintDateRange({ endDate: '2026-01-20T00:00:00.000Z' }, now);
  assert.equal(onlyEnd.startDate, '2026-01-06T00:00:00.000Z');

  const bad = defaultSprintDateRange({
    startDate: '2026-01-14T00:00:00.000Z',
    endDate: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(bad.error, 'datesInvalid');

  const equal = defaultSprintDateRange({
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(equal.error, 'datesInvalid');

  const invalidTreatedMissing = defaultSprintDateRange(
    { startDate: 'nope', endDate: 'also-nope' },
    now
  );
  assert.equal(invalidTreatedMissing.startDate, '2026-08-11T00:00:00.000Z');
});

test('isSprintDateRangeInvalid chỉ khi cả hai filled và start >= end', () => {
  assert.equal(isSprintDateRangeInvalid('2026-01-02', '2026-01-01'), true);
  assert.equal(isSprintDateRangeInvalid('2026-01-01', '2026-01-02'), false);
  assert.equal(isSprintDateRangeInvalid('2026-01-01', ''), false);
});

test('assertCanStartSprint: quyền, planned, issues, member overlap', () => {
  const sprint = { _id: 's1', name: 'S1', status: 'planned' };
  assert.equal(assertCanStartSprint({ sprint, issueCount: 1, canManage: false }).ok, false);
  assert.equal(assertCanStartSprint({ sprint: { ...sprint, status: 'active' }, issueCount: 1, canManage: true }).ok, false);
  assert.equal(assertCanStartSprint({ sprint, issueCount: 0, canManage: true }).errorKey, 'workspace.projectHubPlanSprintIssuesEmpty');
  const memberIdsBySprintId = new Map([
    ['s1', new Set(['A', 'B'])],
    ['s2', new Set(['A', 'C'])],
  ]);
  assert.equal(
    assertCanStartSprint({
      sprint,
      sprints: [sprint, { _id: 's2', status: 'active' }],
      issueCount: 1,
      canManage: true,
      memberIdsBySprintId,
    }).errorKey,
    'workspace.projectHubSprintStartMemberOverlap'
  );
  const disjoint = new Map([
    ['s1', new Set(['D', 'E'])],
    ['s2', new Set(['A', 'B', 'C'])],
  ]);
  assert.equal(
    assertCanStartSprint({
      sprint,
      sprints: [sprint, { _id: 's2', status: 'active' }],
      issueCount: 2,
      canManage: true,
      memberIdsBySprintId: disjoint,
    }).ok,
    true
  );
  assert.equal(assertCanStartSprint({ sprint, sprints: [sprint], issueCount: 2, canManage: true }).ok, true);
});

test('buildSprintMemberIdsBySprintId + collectIssueMemberIds', () => {
  const ids = collectIssueMemberIds({
    assigneeId: 'u1',
    assignments: [{ userId: 'u2' }],
    assignees: [{ id: 'u3' }],
  });
  assert.ok(ids.has('u1') && ids.has('u2') && ids.has('u3'));
  const map = buildSprintMemberIdsBySprintId([
    { sprintId: 's1', assigneeId: 'A' },
    { sprintId: 's1', assignments: [{ userId: 'B' }] },
    { sprintId: 's2', assigneeId: 'C' },
    { sprintId: null, assigneeId: 'X' },
  ]);
  assert.deepEqual([...map.get('s1')].sort(), ['A', 'B']);
  assert.deepEqual([...map.get('s2')], ['C']);
});

test('resolveActiveSprint: 0 / 1 / mới nhất khi 2', () => {
  assert.equal(resolveActiveSprint([]), null);
  const one = { _id: 'a', status: 'active', createdAt: '2026-01-01' };
  assert.equal(resolveActiveSprint([one])._id, 'a');
  const older = { _id: 'old', status: 'active', createdAt: '2026-01-01' };
  const newer = { _id: 'new', status: 'active', createdAt: '2026-02-01' };
  assert.equal(resolveActiveSprint([older, newer])._id, 'new');
});

test('resolveViewerActiveSprint: ưu tiên sprint active có work của viewer', () => {
  const older = { _id: 's-old', status: 'active', createdAt: '2026-01-01' };
  const newer = { _id: 's-new', status: 'active', createdAt: '2026-02-01' };
  const cards = [
    { sprintId: 's-old', assigneeId: 'u1' },
    { sprintId: 's-old', assigneeId: 'u2' },
    { sprintId: 's-new', assigneeId: 'u3' },
  ];
  assert.equal(
    resolveViewerActiveSprint({ sprints: [older, newer], cards, userId: 'u1' })._id,
    's-old'
  );
  assert.equal(
    resolveViewerActiveSprint({ sprints: [older, newer], cards, userId: 'u3' })._id,
    's-new'
  );
  assert.equal(
    resolveViewerActiveSprint({ sprints: [older, newer], cards, userId: 'nobody' })._id,
    's-new'
  );
  assert.equal(resolveViewerActiveSprint({ sprints: [], cards, userId: 'u1' }), null);
});

test('isCardInSprint: match / null / khác id', () => {
  assert.equal(isCardInSprint({ sprintId: 's1' }, 's1'), true);
  assert.equal(isCardInSprint({ sprintId: null }, 's1'), false);
  assert.equal(isCardInSprint({ sprintId: 's2' }, 's1'), false);
  assert.equal(isCardInSprint({ sprintId: 's1' }, ''), false);
});

test('isProjectDateRangeInvalid: thiếu một ngày OK; start > end invalid; cùng ngày OK', () => {
  assert.equal(isProjectDateRangeInvalid('', '2026-02-01'), false);
  assert.equal(isProjectDateRangeInvalid('2026-02-01', ''), false);
  assert.equal(isProjectDateRangeInvalid('2026-02-01', '2026-02-01'), false);
  assert.equal(isProjectDateRangeInvalid('2026-02-10', '2026-02-01'), true);
  assert.equal(isProjectDateRangeInvalid('2026-01-01', '2026-12-31'), false);
});
