import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertCanStartSprint,
  buildIssueOverlay,
  buildSprintMemberIdsBySprintId,
  classifyListStatusBucket,
  childWorkProgressBarClass,
  childWorkProgressPct,
  collectIssueMemberIds,
  listsForStatusSelect,
  statusBucketPillClass,
  statusSelectBucket,
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
  resolveHubActor,
  collectCrWorkItems,
  isLinkableCrWorkType,
  mergeChangeRequestPatch,
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

test('statusBucketPillClass và childWorkProgress*', () => {
  assert.ok(statusBucketPillClass('done').includes('bg-success'));
  assert.ok(statusBucketPillClass('progress').includes('bg-primary'));
  assert.ok(statusBucketPillClass('todo').includes('bg-muted'));
  assert.equal(childWorkProgressPct(1, 1), 100);
  assert.equal(childWorkProgressPct(1, 2), 50);
  assert.equal(childWorkProgressPct(0, 0), 0);
  assert.ok(childWorkProgressBarClass({ done: 1, total: 1 }).includes('bg-success'));
  assert.ok(childWorkProgressBarClass({ done: 0, total: 1 }).includes('bg-primary'));
});

test('listsForStatusSelect: ẩn 4 cột VI khi đã có cột EN cùng bucket', () => {
  const lists = [
    { _id: 'en-todo', title: 'Todo', statusKey: 'todo', order: 1 },
    { _id: 'en-doing', title: 'In progress', statusKey: 'doing', order: 2 },
    { _id: 'en-review', title: 'Review', statusKey: 'review', order: 3 },
    { _id: 'en-done', title: 'Done', statusKey: 'done', order: 4 },
    { _id: 'en-cancel', title: 'Cancelled', statusKey: 'cancelled', order: 5 },
    { _id: 'vi-todo', title: 'Chưa làm', order: 6 },
    { _id: 'vi-doing', title: 'Đang làm', order: 7 },
    { _id: 'vi-review', title: 'Chờ duyệt', order: 8 },
    { _id: 'vi-done', title: 'Xong', order: 9 },
  ];
  assert.equal(statusSelectBucket({ title: 'Chưa làm' }), 'todo');
  assert.equal(statusSelectBucket({ title: 'Đang làm' }), 'doing');
  assert.equal(statusSelectBucket({ title: 'Chờ duyệt' }), 'review');
  assert.equal(statusSelectBucket({ title: 'Xong' }), 'done');
  const titles = listsForStatusSelect(lists).map((l) => l.title);
  assert.deepEqual(titles, ['Todo', 'In progress', 'Review', 'Done', 'Cancelled']);
  const onVi = listsForStatusSelect(lists, 'vi-todo').map((l) => l._id);
  assert.ok(onVi.includes('vi-todo'));
  assert.ok(!onVi.includes('en-todo'));
});

test('listsForStatusSelect: có statusKey thì bỏ cột unmatched kể cả khác bucket', () => {
  const lists = [
    { _id: 'en-todo', title: 'Todo', statusKey: 'todo', order: 1 },
    { _id: 'en-done', title: 'Done', statusKey: 'done', order: 2 },
    { _id: 'custom', title: 'Khác', order: 3 },
  ];
  const ids = listsForStatusSelect(lists).map((l) => l._id);
  assert.deepEqual(ids, ['en-todo', 'en-done']);
  const onCustom = listsForStatusSelect(lists, 'custom').map((l) => l._id);
  assert.ok(onCustom.includes('custom'));
  assert.ok(onCustom.includes('en-todo'));
  assert.ok(onCustom.includes('en-done'));
});

test('listsForStatusSelect: board không statusKey vẫn dedupe bucket EN/VI', () => {
  const lists = [
    { _id: 'en-todo', title: 'Todo', order: 1 },
    { _id: 'en-doing', title: 'In progress', order: 2 },
    { _id: 'vi-todo', title: 'Chưa làm', order: 3 },
    { _id: 'vi-doing', title: 'Đang làm', order: 4 },
  ];
  const titles = listsForStatusSelect(lists).map((l) => l.title);
  assert.deepEqual(titles, ['Todo', 'In progress']);
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

test('resolveHubActor: DTO name, members lookup, fallback id', () => {
  const named = resolveHubActor({ reporterName: 'An', createdBy: 'u1' }, []);
  assert.equal(named.name, 'An');
  assert.equal(named.userId, 'u1');
  const fromMember = resolveHubActor({ createdBy: 'u2' }, [
    { userId: 'u2', displayName: 'Binh', avatar: 'a.png' },
  ]);
  assert.equal(fromMember.name, 'Binh');
  assert.equal(fromMember.avatar, 'a.png');
  const fallback = resolveHubActor({ createdBy: 'abc123456789' }, []);
  assert.equal(fallback.name, '456789');
  assert.equal(resolveHubActor({}, []), null);
});

test('collectCrWorkItems: union workItems + workItemIds, join boardCards', () => {
  const dto = collectCrWorkItems({ workItems: [{ _id: 't1', title: 'A' }] }, []);
  assert.equal(dto[0].title, 'A');
  const joined = collectCrWorkItems(
    { workItemIds: ['t2'] },
    [{ _id: 't2', title: 'Card' }]
  );
  assert.equal(joined[0].title, 'Card');
  const union = collectCrWorkItems(
    { workItems: [{ _id: 't1', title: 'A' }], workItemIds: ['t1', 't2'] },
    [{ _id: 't2', title: 'Card' }]
  );
  assert.equal(union.length, 2);
  assert.equal(union[1].title, 'Card');
  assert.equal(collectCrWorkItems({}, []).length, 0);
});

test('mergeChangeRequestPatch: DTO mỏng + linkWorkItemId → chip', () => {
  const prev = { _id: 'cr1', title: 'CR', workItemIds: [], workItems: [] };
  const thin = {
    _id: 'cr1',
    title: 'CR',
    createdBy: 'u1',
  };
  const cards = [{ _id: 'task1', title: 'Login API', issueType: 'task' }];
  const merged = mergeChangeRequestPatch(prev, thin, { linkWorkItemId: 'task1' }, cards);
  assert.deepEqual(merged.workItemIds, ['task1']);
  assert.equal(merged.workItems.length, 1);
  assert.equal(merged.workItems[0].title, 'Login API');
  assert.equal(merged.createdBy, 'u1');
});

test('mergeChangeRequestPatch: unlink lọc chip; không xóa work khi saved thiếu array', () => {
  const prev = {
    _id: 'cr1',
    workItemIds: ['t1', 't2'],
    workItems: [
      { _id: 't1', title: 'A' },
      { _id: 't2', title: 'B' },
    ],
  };
  const unlinked = mergeChangeRequestPatch(prev, { _id: 'cr1', title: 'x' }, { unlinkWorkItemId: 't1' }, []);
  assert.deepEqual(unlinked.workItemIds, ['t2']);
  assert.equal(unlinked.workItems.length, 1);
  assert.equal(unlinked.workItems[0]._id, 't2');
  const kept = mergeChangeRequestPatch(prev, { _id: 'cr1', status: 'approved' }, {}, []);
  assert.deepEqual(kept.workItemIds, ['t1', 't2']);
});

test('isLinkableCrWorkType: feature/story/task/bug', () => {
  assert.equal(isLinkableCrWorkType('feature'), true);
  assert.equal(isLinkableCrWorkType('story'), true);
  assert.equal(isLinkableCrWorkType('epic'), false);
});
