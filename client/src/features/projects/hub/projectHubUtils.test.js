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
  timelineBarForegroundClass,
  timelineBarToneClass,
  countCardsByIssueType,
  countCardsInSprint,
  countPlanningByType,
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
  pickNextHubActions,
  formatHubActivityLine,
  normalizeHubActivityRow,
  mapHubActivityItem,
  countUnassignedOpenCards,
  sumOpenCardEstimateHours,
  buildOverviewDashboardCharts,
  chartsFromOverviewApi,
  cardsHavePriorityField,
  countOpenCardsByAssignee,
  overviewDonutAnnulusPath,
  overviewDonutCalloutPoints,
  resolveOverviewDonutCalloutCollisions,
  OVERVIEW_DONUT_CALLOUT_MIN_GAP,
  listHubHealthCards,
  listOverviewChartSegmentCards,
  formatHubProjectStatus,
  hubAttentionState,
  hubActionAttentionRank,
} from './projectHubUtils.js';

const mockT = (key, vars = {}) => {
  const table = {
    'workspace.projectHubWorkFieldAssignee': 'Assignee',
    'workspace.projectHubWorkFieldTargetDate': 'Target date',
    'workspace.projectHubWorkFieldDueDate': 'Due date',
    'workspace.projectHubWorkFieldEstimate': 'Estimate',
    'workspace.projectHubWorkFieldIssue': 'Issue',
    'workspace.projectHubWorkNone': 'None',
    'workspace.projectHubActivityUpdated': 'Updated {field}',
    'workspace.projectHubActivityChanged': 'Changed {field}',
    'workspace.projectHubActivityCreated': 'Created work item',
    'workspace.projectHubActivityUpdatedMultiple': 'Updated {fields}',
    'workspace.projectHubActivityCardUpdated': 'Card updated',
    'workspace.projectHubActivityUntitledWork': 'Work item',
  };
  let out = table[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

test('countPlanningByType và countCardsInSprint', () => {
  assert.deepEqual(
    countPlanningByType([
      { type: 'epic' },
      { type: 'feature' },
      { type: 'Feature' },
      { type: 'milestone' },
    ]),
    { epic: 1, feature: 2 }
  );
  assert.equal(
    countCardsInSprint(
      [{ sprintId: 's1' }, { sprintId: 's2' }, { sprintId: 's1' }],
      's1'
    ),
    2
  );
  assert.equal(countCardsInSprint([{ sprintId: 's1' }], ''), 0);
});

test('pickNextHubActions: lấy từ cards mở, không từ activity log', () => {
  const lists = [
    { _id: 'l1', statusKey: 'todo', title: 'To Do' },
    { _id: 'l2', statusKey: 'done', title: 'Done' },
  ];
  const cards = [
    { _id: 'c1', title: 'Done card', listId: 'l2', status: 'done' },
    { _id: 'c2', title: 'Overdue', listId: 'l1', dueDate: '2020-01-01T00:00:00.000Z' },
    { _id: 'c3', title: 'Soon', listId: 'l1', dueDate: '2099-06-01T00:00:00.000Z' },
    { _id: 'c4', title: 'No due', listId: 'l1' },
  ];
  const actions = pickNextHubActions(cards, lists, { limit: 3, projectCode: 'QLKS' });
  assert.deepEqual(
    actions.map((a) => a.title),
    ['Overdue', 'Soon', 'No due']
  );
  assert.ok(!actions.some((a) => a.title === 'Done card'));
  assert.equal(actions[0].dueTone, 'overdue');
  assert.equal(actions[0].issueKey, 'QLKS-C2');
});

test('hubActionAttentionRank: Overdue → soon → in review → unassigned → other', () => {
  assert.equal(hubActionAttentionRank({ dueTone: 'overdue', isInReview: true, hasAssignee: true }), 0);
  assert.equal(hubActionAttentionRank({ dueTone: 'soon', isInReview: true, hasAssignee: false }), 1);
  assert.equal(hubActionAttentionRank({ dueTone: 'none', isInReview: true, hasAssignee: false }), 2);
  assert.equal(hubActionAttentionRank({ dueTone: 'none', isInReview: false, hasAssignee: false }), 3);
  assert.equal(hubActionAttentionRank({ dueTone: 'none', isInReview: false, hasAssignee: true }), 4);
});

test('pickNextHubActions: ranking In Review trước Unassigned', () => {
  const soon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const far = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const lists = [
    { _id: 'l-todo', statusKey: 'todo', title: 'To Do' },
    { _id: 'l-review', statusKey: 'review', title: 'In Review' },
  ];
  const cards = [
    { _id: 'a1', title: 'Other', listId: 'l-todo', assigneeId: 'u1', assigneeName: 'An', dueDate: far },
    { _id: 'a2', title: 'Unassigned', listId: 'l-todo' },
    { _id: 'a3', title: 'In Review', listId: 'l-review', assigneeId: 'u2', assigneeName: 'Binh', dueDate: far },
    { _id: 'a4', title: 'Due soon', listId: 'l-todo', assigneeId: 'u3', assigneeName: 'Chi', dueDate: soon },
    { _id: 'a5', title: 'Overdue', listId: 'l-todo', assigneeId: 'u4', assigneeName: 'Dung', dueDate: '2020-01-01T00:00:00.000Z' },
  ];
  const actions = pickNextHubActions(cards, lists, { limit: 5 });
  assert.deepEqual(
    actions.map((a) => a.title),
    ['Overdue', 'Due soon', 'In Review', 'Unassigned', 'Other']
  );
  assert.equal(actions[2].statusLabel, 'In Review');
  assert.equal(actions[2].assigneeName, 'Binh');
});

test('countUnassignedOpenCards và sumOpenCardEstimateHours', () => {
  const lists = [
    { _id: 'l1', statusKey: 'todo', title: 'To Do' },
    { _id: 'l2', statusKey: 'done', title: 'Done' },
  ];
  const cards = [
    { _id: 'c1', listId: 'l1', assigneeId: 'u1', estimateHours: 2 },
    { _id: 'c2', listId: 'l1', estimateHours: 3 },
    { _id: 'c3', listId: 'l2', status: 'done', estimateHours: 8 },
  ];
  assert.equal(countUnassignedOpenCards(cards, lists), 1);
  assert.equal(sumOpenCardEstimateHours(cards, lists), 5);
});

test('formatHubProjectStatus: i18n hoặc fallback raw', () => {
  const t = (key) =>
    key === 'workspace.projectHubProjectStatus_in_development' ? 'Đang phát triển' : key;
  assert.equal(formatHubProjectStatus('in_development', t), 'Đang phát triển');
  assert.equal(formatHubProjectStatus('CUSTOM', t), 'CUSTOM');
});

test('formatHubActivityLine: không trả raw field/type keys', () => {
  const row = normalizeHubActivityRow({
    _id: 'log1',
    type: 'work.field_changed',
    title: 'Login API',
    payload: { field: 'targetDate', from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' },
    createdAt: '2026-01-02T00:00:00.000Z',
  });
  const line = formatHubActivityLine(row, mockT, { locale: 'en' });
  assert.ok(!line.includes('work.field_changed'));
  assert.ok(!line.includes('targetDate'));
  assert.ok(line.includes('Target date'));
  assert.ok(line.includes('Updated'));
});

test('mapHubActivityItem: work.field_changed → title work + detail i18n', () => {
  const item = mapHubActivityItem(
    {
      _id: 'log2',
      type: 'work.field_changed',
      title: 'Fix bug',
      payload: { field: 'assigneeId', from: null, to: 'u1' },
      createdAt: '2026-01-03T00:00:00.000Z',
    },
    mockT
  );
  assert.equal(item.title, 'Fix bug');
  assert.ok(item.detail.includes('Assignee'));
  assert.ok(!item.detail.includes('assigneeId'));
});

test('mapHubActivityItem: title cũ = field key → untitled + status labels', () => {
  const item = mapHubActivityItem(
    {
      _id: 'log-status',
      type: 'work.field_changed',
      title: 'status',
      taskId: 'card1',
      payload: { field: 'status', from: 'todo', to: 'in_progress' },
      createdAt: '2026-01-03T00:00:00.000Z',
    },
    mockT,
    { cards: [{ _id: 'card1', title: 'Doi chieu lech thue' }] }
  );
  assert.equal(item.title, 'Doi chieu lech thue');
  assert.ok(!item.detail.includes('todo'));
  assert.ok(item.detail.includes('To Do') || item.detail.includes('In Progress'));
});

test('mapHubActivityItem: actorName từ actorId + members', () => {
  const item = mapHubActivityItem(
    {
      _id: 'log3',
      type: 'work.field_changed',
      title: 'Fix bug',
      actorId: 'abc123456789',
      payload: { field: 'status', from: 'todo', to: 'review' },
      createdAt: '2026-01-03T00:00:00.000Z',
    },
    mockT,
    { members: [{ userId: 'abc123456789', displayName: 'Nguyen A' }] }
  );
  assert.equal(item.actorName, 'Nguyen A');
  assert.equal(item.title, 'Fix bug');
});

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

test('timelineBarToneClass: overdue > done > progress > todo', () => {
  assert.equal(timelineBarToneClass({ bucket: 'todo', dueTone: 'overdue' }), 'bg-destructive');
  assert.equal(timelineBarToneClass({ bucket: 'done', dueTone: 'none' }), 'bg-success');
  assert.equal(timelineBarToneClass({ bucket: 'progress', dueTone: 'soon' }), 'bg-primary');
  assert.equal(
    timelineBarToneClass({ bucket: 'todo', dueTone: 'none' }),
    'bg-primary/40 ring-1 ring-inset ring-primary/25'
  );
  assert.equal(timelineBarForegroundClass({ bucket: 'progress', dueTone: 'none' }), 'text-primary-foreground');
  assert.equal(timelineBarForegroundClass({ bucket: 'todo', dueTone: 'none' }), 'text-foreground');
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

test('listsForStatusSelect: lọc theo transitionsByFrom — Done không mở Review', () => {
  const lists = [
    { _id: 'todo', title: 'Todo', statusKey: 'todo', order: 1 },
    { _id: 'ip', title: 'Đang xử lý', statusKey: 'in_progress', order: 2 },
    { _id: 'review', title: 'Review', statusKey: 'review', order: 3 },
    { _id: 'done', title: 'Done', statusKey: 'done', order: 4 },
  ];
  const transitionsByFrom = {
    done: [{ toKey: 'in_progress' }],
    review: [{ toKey: 'done' }, { toKey: 'in_progress' }],
  };
  const fromDone = listsForStatusSelect(lists, 'done', transitionsByFrom).map((l) => l.statusKey);
  assert.deepEqual([...fromDone].sort(), ['done', 'in_progress']);
  assert.equal(fromDone.includes('review'), false);
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

test('isCardInSprint: Feature inherit sprint từ Task con', () => {
  const feature = { _id: 'f1', kind: 'planning', issueType: 'feature', sprintId: null };
  const childInSprint = { _id: 't1', featureId: 'f1', sprintId: 's1', issueType: 'task' };
  const childOther = { _id: 't2', featureId: 'f1', sprintId: 's2', issueType: 'task' };
  assert.equal(isCardInSprint(feature, 's1', { allCards: [childInSprint] }), true);
  assert.equal(isCardInSprint(feature, 's1', { allCards: [childOther] }), false);
  assert.equal(isCardInSprint(feature, 's1', { allCards: [] }), false);
  assert.equal(isCardInSprint(feature, 's1'), false);
});

test('isCardInSprint: Task không inherit qua featureId', () => {
  const task = { _id: 't1', issueType: 'task', sprintId: null, featureId: 'f1' };
  assert.equal(
    isCardInSprint(task, 's1', {
      allCards: [{ _id: 't2', featureId: 'f1', sprintId: 's1' }],
    }),
    false
  );
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
  // ObjectId giả làm reporterName → bỏ, lấy members
  const oid = '6a59e6cc81b638829ba7b085';
  const fromOidName = resolveHubActor({ createdBy: oid, reporterName: oid }, [
    { userId: oid, displayName: 'Nhất Nhất' },
  ]);
  assert.equal(fromOidName.name, 'Nhất Nhất');
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

test('hubAttentionState: overdue >= 1 → attention', () => {
  assert.equal(hubAttentionState({ overdue: 0 }), 'on_track');
  assert.equal(hubAttentionState({ overdue: 1 }), 'attention');
  assert.equal(hubAttentionState({ overdue: 3 }), 'attention');
  assert.equal(hubAttentionState({}), 'on_track');
  assert.equal(hubAttentionState({ overdue: -1 }), 'on_track');
  assert.equal(hubAttentionState({ overdue: NaN }), 'on_track');
  assert.equal(hubAttentionState({ overdue: '2' }), 'attention');
});

test('listHubHealthCards: overdue / inReview titles', () => {
  const lists = [
    { _id: 'l1', statusKey: 'todo', title: 'To Do' },
    { _id: 'l2', statusKey: 'review', title: 'In Review' },
    { _id: 'l3', statusKey: 'done', title: 'Done' },
  ];
  const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const cards = [
    { _id: 'a', listId: 'l1', title: 'Overdue A', dueDate: past },
    { _id: 'b', listId: 'l1', title: 'Soon B', dueDate: future },
    { _id: 'c', listId: 'l2', title: 'Review C' },
    { _id: 'd', listId: 'l3', title: 'Done past', dueDate: past },
  ];
  assert.deepEqual(
    listHubHealthCards(cards, lists, 'overdue').map((r) => r.title),
    ['Overdue A']
  );
  assert.deepEqual(
    listHubHealthCards(cards, lists, 'inReview').map((r) => r.title),
    ['Review C']
  );
});

test('listOverviewChartSegmentCards: status / priority / assignee', () => {
  const lists = [
    { _id: 'l1', statusKey: 'todo', title: 'To Do' },
    { _id: 'l2', statusKey: 'done', title: 'Done' },
  ];
  const cards = [
    { _id: '1', listId: 'l1', title: 'Todo Low', priority: 'low' },
    { _id: '2', listId: 'l2', title: 'Done Med', priority: 'medium', assigneeId: 'u1', assigneeName: 'Ann' },
    { _id: '3', listId: 'l1', title: 'Open Unassigned', priority: 'high' },
  ];
  assert.deepEqual(
    listOverviewChartSegmentCards({ cards, lists, chart: 'status', segmentKey: 'done' }).map(
      (r) => r.title
    ),
    ['Done Med']
  );
  assert.deepEqual(
    listOverviewChartSegmentCards({ cards, lists, chart: 'priority', segmentKey: 'low' }).map(
      (r) => r.title
    ),
    ['Todo Low']
  );
  assert.deepEqual(
    listOverviewChartSegmentCards({
      cards,
      lists,
      chart: 'assignee',
      segmentKey: 'unassigned',
    }).map((r) => r.title),
    ['Open Unassigned', 'Todo Low']
  );
  assert.deepEqual(
    listOverviewChartSegmentCards({
      cards,
      lists,
      chart: 'assignee',
      segmentKey: 'u1',
    }).map((r) => r.title),
    []
  );
});

test('buildOverviewDashboardCharts: status donut + type bars từ cards/lists', () => {
  const lists = [
    { _id: 'l1', title: 'Todo', statusKey: 'todo' },
    { _id: 'l2', title: 'Doing', statusKey: 'doing' },
    { _id: 'l3', title: 'Done', statusKey: 'done' },
  ];
  const cards = [
    { _id: 'a', listId: 'l1', issueType: 'story' },
    { _id: 'b', listId: 'l2', issueType: 'task' },
    { _id: 'c', listId: 'l2', issueType: 'bug' },
    { _id: 'd', listId: 'l3', issueType: 'task' },
  ];
  const charts = buildOverviewDashboardCharts({ cards, lists });
  assert.equal(charts.statusTotal, 4);
  assert.equal(charts.donePct, 25);
  assert.equal(charts.hasPriorityData, false);
  assert.equal(charts.showPriorityChart, true);
  assert.equal(charts.prioritySkippedReason, 'no_card_priority_field');
  assert.equal(charts.prioritySegments.length, 0);
  assert.equal(charts.assigneeTotal, 3);
  assert.equal(charts.assigneeSegments.find((s) => s.key === 'unassigned')?.count, 3);
  assert.deepEqual(
    charts.statusSegments.map((s) => [s.key, s.count, s.pct]),
    [
      ['todo', 1, 25],
      ['progress', 2, 50],
      ['done', 1, 25],
    ]
  );
  assert.ok(charts.statusSegments.every((s) => Number.isFinite(s.startAngle) && Number.isFinite(s.sweepAngle)));
  assert.equal(
    charts.statusSegments.reduce((sum, s) => sum + s.sweepAngle, 0),
    360
  );
  assert.equal(charts.statusSegments.find((s) => s.key === 'todo')?.fillClass, 'fill-muted-foreground');
  assert.equal(charts.statusSegments.find((s) => s.key === 'progress')?.fillClass, 'fill-primary');
  assert.equal(charts.statusSegments.find((s) => s.key === 'done')?.fillClass, 'fill-success');
  assert.equal(charts.assigneeSegments.find((s) => s.key === 'unassigned')?.fillClass, 'fill-muted-foreground/45');
  assert.deepEqual(
    charts.typeSegments.map((s) => [s.key, s.count, s.pct]),
    [
      ['story', 1, 25],
      ['task', 2, 50],
      ['bug', 1, 25],
    ]
  );
});

test('chartsFromOverviewApi: maps BE overview charts to dashboard shape', () => {
  const charts = chartsFromOverviewApi(
    {
      byStatus: { todo: 2, progress: 1, done: 1 },
      byType: { story: 1, task: 2, bug: 1, other: 0 },
      byPriority: [{ key: 'high', count: 2 }],
      byAssignee: [{ userId: 'u1', displayName: 'A', count: 2 }],
    },
    { items: [{ key: 'high', label: 'High' }] }
  );
  assert.equal(charts.statusTotal, 4);
  assert.equal(charts.donePct, 25);
  assert.equal(charts.typeTotal, 4);
  assert.equal(charts.hasPriorityData, true);
  assert.equal(charts.priorityTotal, 2);
  assert.equal(charts.assigneeTotal, 2);
});

test('buildOverviewDashboardCharts: empty + other type', () => {
  const empty = buildOverviewDashboardCharts({ cards: [], lists: [] });
  assert.equal(empty.statusTotal, 0);
  assert.equal(empty.donePct, 0);
  assert.equal(empty.typeTotal, 0);
  assert.equal(empty.hasPriorityData, false);
  assert.equal(empty.assigneeTotal, 0);
  assert.ok(empty.statusSegments.every((s) => s.count === 0 && s.pct === 0));

  const withOther = buildOverviewDashboardCharts({
    cards: [{ listId: 'x', issueType: 'epic' }],
    lists: [{ _id: 'x', title: 'Todo' }],
    issueCounts: { story: 0, task: 0, bug: 0, other: 1 },
  });
  assert.equal(withOther.typeTotal, 1);
  assert.equal(withOther.typeSegments.find((s) => s.key === 'other')?.count, 1);
});

test('buildOverviewDashboardCharts: priority bars khi card.priority có mặt', () => {
  assert.equal(cardsHavePriorityField([{ title: 'x' }]), false);
  assert.equal(cardsHavePriorityField([{ priority: 'high' }]), true);
  assert.equal(cardsHavePriorityField([{ priority: '' }]), false);

  const charts = buildOverviewDashboardCharts({
    cards: [
      { listId: 'l1', priority: 'high', issueType: 'task' },
      { listId: 'l1', priority: 'high', issueType: 'task' },
      { listId: 'l1', priority: 'low', issueType: 'bug' },
      { listId: 'l1', priority: 'urgent', issueType: 'story' },
    ],
    lists: [{ _id: 'l1', title: 'Todo' }],
  });
  assert.equal(charts.hasPriorityData, true);
  assert.equal(charts.showPriorityChart, true);
  assert.equal(charts.prioritySkippedReason, '');
  assert.deepEqual(
    charts.prioritySegments.map((s) => [s.key, s.count]),
    [
      ['low', 1],
      ['medium', 0],
      ['high', 2],
      ['urgent', 1],
    ]
  );
  assert.ok(charts.prioritySegments.every((s) => s.fillClass && s.barClass));
  assert.equal(charts.prioritySegments.length, 4);
});

test('countOpenCardsByAssignee: open only + Unassigned + members tên', () => {
  const lists = [
    { _id: 'open', title: 'Todo' },
    { _id: 'done', title: 'Done', statusKey: 'done' },
  ];
  const cards = [
    { listId: 'open', assigneeId: 'u1', assigneeName: 'Huy' },
    { listId: 'open', assigneeId: 'u1', assigneeName: 'Huy' },
    { listId: 'open', assigneeId: 'u2' },
    { listId: 'open' },
    { listId: 'done', assigneeId: 'u1', assigneeName: 'Huy' },
  ];
  const members = [{ userId: 'u2', displayName: 'Danh Do' }];
  const out = countOpenCardsByAssignee(cards, lists, members);
  assert.equal(out.total, 4);
  assert.deepEqual(
    out.segments.map((s) => [s.key, s.count, s.label]),
    [
      ['u1', 2, 'Huy'],
      ['u2', 1, 'Danh Do'],
      ['unassigned', 1, 'Unassigned'],
    ]
  );
  assert.equal(out.segments.reduce((sum, s) => sum + s.sweepAngle, 0), 360);
});

test('overviewDonutAnnulusPath: slice và full ring', () => {
  const slice = overviewDonutAnnulusPath(50, 50, 40, 24, 0, 90);
  assert.ok(slice.startsWith('M '));
  assert.ok(slice.includes('A 40'));
  assert.ok(slice.includes('Z'));
  const full = overviewDonutAnnulusPath(50, 50, 40, 24, 0, 360);
  assert.ok(full.includes('A 40'));
  assert.equal(overviewDonutAnnulusPath(50, 50, 40, 24, 0, 0), '');
});

test('overviewDonutCalloutPoints: chỉ lát > 0; anchor trái/phải theo nửa vòng', () => {
  const charts = buildOverviewDashboardCharts({
    cards: [
      { _id: 'a', listId: 'l1', issueType: 'task' },
      { _id: 'b', listId: 'l1', issueType: 'task' },
      { _id: 'c', listId: 'l3', issueType: 'task' },
    ],
    lists: [
      { _id: 'l1', title: 'Todo', statusKey: 'todo' },
      { _id: 'l2', title: 'Doing', statusKey: 'doing' },
      { _id: 'l3', title: 'Done', statusKey: 'done' },
    ],
  });
  assert.equal(charts.statusSegments.length, 3);
  assert.equal(charts.statusSegments.find((s) => s.key === 'progress')?.count, 0);

  const callouts = overviewDonutCalloutPoints(charts.statusSegments, {
    cx: 100,
    cy: 80,
    rimR: 38,
    elbowR: 50,
    labelX: 168,
  });
  assert.equal(callouts.length, 2);
  assert.ok(callouts.every((c) => c.count > 0));
  assert.ok(callouts.every((c) => Number.isFinite(c.x1) && Number.isFinite(c.x3)));
  for (const c of callouts) {
    assert.ok(c.textAnchor === 'start' || c.textAnchor === 'end');
    // L-line: đoạn ngang từ elbow → neo chữ (y2 === y3) khi không collision
    assert.ok(Number.isFinite(c.y2) && Number.isFinite(c.y3));
    assert.notEqual(c.x2, c.x3);
  }
});

test('resolveOverviewDonutCalloutCollisions: tách y cùng phía khi sát nhau', () => {
  const rows = [
    { key: 'a', y3: 40, textAnchor: 'end' },
    { key: 'b', y3: 42, textAnchor: 'end' },
    { key: 'c', y3: 100, textAnchor: 'start' },
  ];
  resolveOverviewDonutCalloutCollisions(rows, { minGap: OVERVIEW_DONUT_CALLOUT_MIN_GAP });
  const left = rows.filter((r) => r.textAnchor === 'end').sort((a, b) => a.y3 - b.y3);
  assert.equal(left.length, 2);
  assert.ok(left[1].y3 - left[0].y3 >= OVERVIEW_DONUT_CALLOUT_MIN_GAP - 0.01);
  assert.equal(rows.find((r) => r.key === 'c').y3, 100);
});

test('overviewDonutCalloutPoints: lát nhỏ sát đỉnh không đè y', () => {
  // Giống case 127 todo + 1 progress + 2 done — hai lát nhỏ cùng nửa trái gần đỉnh.
  const charts = buildOverviewDashboardCharts({
    cards: [
      ...Array.from({ length: 127 }, (_, i) => ({
        _id: `t${i}`,
        listId: 'l1',
        issueType: 'task',
      })),
      { _id: 'p1', listId: 'l2', issueType: 'task' },
      { _id: 'd1', listId: 'l3', issueType: 'task' },
      { _id: 'd2', listId: 'l3', issueType: 'task' },
    ],
    lists: [
      { _id: 'l1', title: 'Todo', statusKey: 'todo' },
      { _id: 'l2', title: 'Doing', statusKey: 'doing' },
      { _id: 'l3', title: 'Done', statusKey: 'done' },
    ],
  });
  const callouts = overviewDonutCalloutPoints(charts.statusSegments, {
    cx: 100,
    cy: 80,
    rimR: 38,
    elbowR: 50,
    labelX: 168,
  });
  assert.equal(callouts.length, 3);
  const bySide = { start: [], end: [] };
  for (const c of callouts) {
    bySide[c.textAnchor === 'end' ? 'end' : 'start'].push(c);
  }
  for (const list of Object.values(bySide)) {
    list.sort((a, b) => a.y3 - b.y3);
    for (let i = 1; i < list.length; i += 1) {
      assert.ok(
        list[i].y3 - list[i - 1].y3 >= OVERVIEW_DONUT_CALLOUT_MIN_GAP - 0.01,
        `overlap ${list[i - 1].key}@${list[i - 1].y3} vs ${list[i].key}@${list[i].y3}`
      );
    }
  }
});
