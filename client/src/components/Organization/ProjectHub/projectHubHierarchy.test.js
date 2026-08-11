import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultWorkTypeConfig, normalizeWorkTypeConfig } from './projectWorkTypes.js';
import {
  buildListTree,
  canListDragOver,
  childTypesForParent,
  comparePlanningOrder,
  computeInsertSortOrder,
  hierarchyBands,
  isBacklogLevelTwoIssue,
  isBoardSprintReady,
  preferListHorizontalDrag,
  resolveListDropAction,
  resolveListHorizontalAction,
  typesInBand,
} from './projectHubHierarchy.js';

const capsAll = {
  epic: true,
  feature: true,
  story: true,
  task: true,
  bug: true,
  subtask: true,
};

test('hierarchyBands: >3 depth → min / story-mid / max', () => {
  const cfg = defaultWorkTypeConfig();
  assert.deepEqual(hierarchyBands(cfg), [0, 2, 3]);
});

test('hierarchyBands: ẩn feature → [0,2,3] vẫn', () => {
  const cfg = normalizeWorkTypeConfig({
    ...defaultWorkTypeConfig(),
    hidden: { ...defaultWorkTypeConfig().hidden, feature: true },
  });
  assert.deepEqual(hierarchyBands(cfg), [0, 2, 3]);
});

test('typesInBand: cấp 2 = story/task/bug', () => {
  const cfg = defaultWorkTypeConfig();
  assert.deepEqual(typesInBand(cfg, 0), ['epic']);
  assert.deepEqual(typesInBand(cfg, 1).sort(), ['bug', 'story', 'task']);
  assert.deepEqual(typesInBand(cfg, 2), ['subtask']);
});

test('childTypesForParent: epic → feature (bậc gần nhất); task → subtask; subtask → []', () => {
  const cfg = defaultWorkTypeConfig();
  assert.deepEqual(childTypesForParent('epic', cfg, capsAll), ['feature']);
  assert.deepEqual(childTypesForParent('feature', cfg, capsAll).sort(), ['bug', 'story', 'task']);
  assert.deepEqual(childTypesForParent('task', cfg, capsAll), ['subtask']);
  assert.deepEqual(childTypesForParent('story', cfg, capsAll), ['subtask']);
  assert.deepEqual(childTypesForParent('subtask', cfg, capsAll), []);
});

test('cây sâu Epic→Bug/Feature→Story→Task→Sub-task: Task vẫn có Create child Sub-task', () => {
  const cfg = normalizeWorkTypeConfig({
    treeOrder: ['epic', 'bug', 'feature', 'story', 'task', 'subtask'],
    depthById: { epic: 0, bug: 1, feature: 1, story: 2, task: 3, subtask: 4 },
  });
  assert.deepEqual(hierarchyBands(cfg), [0, 2, 4]);
  assert.deepEqual(childTypesForParent('epic', cfg, capsAll).sort(), ['bug', 'feature']);
  assert.deepEqual(childTypesForParent('story', cfg, capsAll), ['task']);
  assert.deepEqual(childTypesForParent('task', cfg, capsAll), ['subtask']);
  assert.deepEqual(childTypesForParent('subtask', cfg, capsAll), []);
});

test('buildListTree: Epic → card → subtask', () => {
  const cfg = defaultWorkTypeConfig();
  const tree = buildListTree({
    epics: [{ _id: 'e1', title: 'Epic 1', type: 'epic' }],
    features: [],
    cards: [
      { _id: 'c1', title: 'Task 1', issueType: 'task', epicId: 'e1' },
      { _id: 'c2', title: 'Sub', issueType: 'task', parentTaskId: 'c1', epicId: 'e1' },
    ],
    config: cfg,
  });
  assert.equal(tree.length, 1);
  assert.equal(tree[0].workType, 'epic');
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].raw._id, 'c1');
  assert.equal(tree[0].children[0].children.length, 1);
  assert.equal(tree[0].children[0].children[0].workType, 'subtask');
});

test('isBacklogLevelTwoIssue: story/task/bug/feature kể cả trong Epic; ẩn sub-task', () => {
  const cfg = defaultWorkTypeConfig();
  const epicIds = new Set(['e1']);
  assert.equal(isBacklogLevelTwoIssue({ issueType: 'story' }, cfg), true);
  assert.equal(isBacklogLevelTwoIssue({ issueType: 'task' }, cfg), true);
  assert.equal(isBacklogLevelTwoIssue({ issueType: 'bug' }, cfg), true);
  assert.equal(isBacklogLevelTwoIssue({ type: 'feature' }, cfg), true);
  assert.equal(isBacklogLevelTwoIssue({ type: 'feature', parentId: 'e1', epicId: 'e1' }, cfg, epicIds), true);
  assert.equal(isBacklogLevelTwoIssue({ issueType: 'task', epicId: 'e1' }, cfg, epicIds), true);
  assert.equal(
    isBacklogLevelTwoIssue({ issueType: 'task', parentTaskId: 'e1', epicId: 'e1' }, cfg, epicIds),
    true
  );
  assert.equal(isBacklogLevelTwoIssue({ issueType: 'task', parentTaskId: 'c1' }, cfg, epicIds), false);
  assert.equal(isBacklogLevelTwoIssue({ type: 'epic' }, cfg), false);
});

test('isBoardSprintReady: active + name + dates', () => {
  assert.equal(isBoardSprintReady([]), false);
  assert.equal(
    isBoardSprintReady([{ status: 'active', name: 'S1', startDate: '2026-01-01' }]),
    false
  );
  assert.equal(
    isBoardSprintReady([
      { status: 'planned', name: 'S1', startDate: '2026-01-01', endDate: '2026-01-14' },
    ]),
    false
  );
  assert.equal(
    isBoardSprintReady([
      { status: 'active', name: 'S1', startDate: '2026-01-01', endDate: '2026-01-14' },
    ]),
    true
  );
});

test('canListDragOver: cùng cấp hoặc lên 1 cấp, không xuống cấp', () => {
  const epic = { id: 'planning:e1', band: 0, children: [{ id: 'card:c1', band: 1, children: [] }] };
  const task = { id: 'card:c1', band: 1, children: [{ id: 'card:s1', band: 2, children: [] }] };
  const sub = { id: 'card:s1', band: 2, children: [] };
  const task2 = { id: 'card:c2', band: 1, children: [] };
  assert.equal(canListDragOver(sub, task), true);
  assert.equal(canListDragOver(sub, task2), true);
  assert.equal(canListDragOver(sub, epic), false);
  assert.equal(canListDragOver(task, epic), true);
  assert.equal(canListDragOver(task, task2), true);
  assert.equal(canListDragOver(epic, task), false);
  assert.equal(canListDragOver(task, sub), false);
  assert.equal(canListDragOver(task, { id: 'card:c1', band: 1, children: [] }), false);
});

test('resolveListDropAction: subtask → task parent; task → epic', () => {
  const epic = {
    id: 'planning:e1',
    band: 0,
    kind: 'planning',
    workType: 'epic',
    raw: { _id: 'e1' },
    children: [],
  };
  const task = {
    id: 'card:c1',
    band: 1,
    kind: 'card',
    workType: 'task',
    raw: { _id: 'c1', epicId: 'e1' },
    children: [],
  };
  const sub = {
    id: 'card:s1',
    band: 2,
    kind: 'card',
    workType: 'subtask',
    raw: { _id: 's1', parentTaskId: 'other', epicId: 'e1' },
    children: [],
  };
  assert.deepEqual(resolveListDropAction(sub, task), {
    mode: 'attach-card-parent',
    kind: 'card',
    activeId: 's1',
    parentTaskId: 'c1',
    epicId: 'e1',
  });
  assert.deepEqual(resolveListDropAction(task, epic), {
    mode: 'attach-card-epic',
    kind: 'card',
    activeId: 'c1',
    epicId: 'e1',
    parentTaskId: null,
  });
});

test('resolveListHorizontalAction: indent peer → parent; outdent sub → sibling', () => {
  const cfg = defaultWorkTypeConfig();
  const task1 = {
    id: 'card:c1',
    band: 1,
    kind: 'card',
    workType: 'task',
    raw: { _id: 'c1', epicId: 'e1' },
    children: [],
  };
  const task2 = {
    id: 'card:c2',
    band: 1,
    kind: 'card',
    workType: 'task',
    raw: { _id: 'c2', epicId: 'e1' },
    children: [],
  };
  const sub = {
    id: 'card:s1',
    band: 2,
    kind: 'card',
    workType: 'subtask',
    raw: { _id: 's1', parentTaskId: 'c1', epicId: 'e1' },
    children: [],
  };
  task1.children = [sub];
  const epic = {
    id: 'planning:e1',
    band: 0,
    kind: 'planning',
    workType: 'epic',
    raw: { _id: 'e1' },
    children: [task1, task2],
  };
  const tree = [epic];
  const flatRows = [
    { node: epic, depth: 0 },
    { node: task1, depth: 1 },
    { node: sub, depth: 2 },
    { node: task2, depth: 1 },
  ];

  assert.deepEqual(
    resolveListHorizontalAction({
      activeNode: task2,
      flatRows,
      tree,
      deltaX: 48,
      config: cfg,
    }),
    {
      mode: 'attach-card-parent',
      kind: 'card',
      activeId: 'c2',
      parentTaskId: 'c1',
      epicId: 'e1',
    }
  );

  assert.deepEqual(
    resolveListHorizontalAction({
      activeNode: sub,
      flatRows,
      tree,
      deltaX: -48,
      config: cfg,
    }),
    {
      mode: 'align-card-siblings',
      kind: 'card',
      activeId: 's1',
      parentTaskId: null,
      epicId: 'e1',
    }
  );

  assert.equal(
    resolveListHorizontalAction({
      activeNode: sub,
      flatRows,
      tree,
      deltaX: 48,
      config: cfg,
    }),
    null
  );
});

test('Feature cấp 2 indent / drop vào Epic cấp 1 để tạo nhóm', () => {
  const cfg = defaultWorkTypeConfig();
  const epic = {
    id: 'planning:e1',
    band: 0,
    kind: 'planning',
    workType: 'epic',
    raw: { _id: 'e1' },
    children: [],
  };
  const feature = {
    id: 'planning:f1',
    band: 1,
    kind: 'planning',
    workType: 'feature',
    raw: { _id: 'f1' },
    children: [],
  };
  const tree = [epic, feature];
  const flatRows = [
    { node: epic, depth: 0 },
    { node: feature, depth: 0 },
  ];

  assert.equal(canListDragOver(feature, epic), true);
  assert.deepEqual(resolveListDropAction(feature, epic), {
    mode: 'attach-feature-epic',
    kind: 'planning',
    activeId: 'f1',
    parentId: 'e1',
  });
  assert.deepEqual(
    resolveListHorizontalAction({
      activeNode: feature,
      flatRows,
      tree,
      deltaX: 48,
      config: cfg,
    }),
    {
      mode: 'attach-feature-epic',
      kind: 'planning',
      activeId: 'f1',
      parentId: 'e1',
    }
  );
  assert.equal(canListDragOver(epic, feature), false);
});

test('preferListHorizontalDrag: chỉ khi |X| ≥ |Y| và đủ ngưỡng indent', () => {
  assert.equal(preferListHorizontalDrag(48, 8), true);
  assert.equal(preferListHorizontalDrag(48, 80), false);
  assert.equal(preferListHorizontalDrag(8, 8), false);
  assert.equal(preferListHorizontalDrag(30, 30), true);
});

test('resolveListDropAction: Story thả dọc vào Feature/Story trong Epic → gắn epic', () => {
  const epic = {
    id: 'planning:e1',
    band: 0,
    kind: 'planning',
    workType: 'epic',
    raw: { _id: 'e1' },
    children: [],
  };
  const feature = {
    id: 'planning:f1',
    band: 1,
    kind: 'planning',
    workType: 'feature',
    raw: { _id: 'f1', parentId: 'e1' },
    children: [],
  };
  const nestedStory = {
    id: 'card:c1',
    band: 1,
    kind: 'card',
    workType: 'story',
    raw: { _id: 'c1', issueType: 'story', epicId: 'e1' },
    children: [],
  };
  const orphanStory = {
    id: 'card:c2',
    band: 1,
    kind: 'card',
    workType: 'story',
    raw: { _id: 'c2', issueType: 'story' },
    children: [],
  };
  epic.children = [feature, nestedStory];
  const tree = [epic, orphanStory];

  assert.equal(canListDragOver(orphanStory, feature), true);
  assert.deepEqual(resolveListDropAction(orphanStory, feature, tree), {
    mode: 'attach-card-epic',
    kind: 'card',
    activeId: 'c2',
    epicId: 'e1',
    parentTaskId: null,
  });
  assert.deepEqual(resolveListDropAction(orphanStory, nestedStory, tree), {
    mode: 'attach-card-epic',
    kind: 'card',
    activeId: 'c2',
    epicId: 'e1',
    parentTaskId: null,
  });
  assert.deepEqual(resolveListDropAction(orphanStory, epic, tree), {
    mode: 'attach-card-epic',
    kind: 'card',
    activeId: 'c2',
    epicId: 'e1',
    parentTaskId: null,
  });
  assert.equal(resolveListDropAction(nestedStory, feature, tree).mode, 'noop');
});

test('computeInsertSortOrder: chèn trước over, midpoint sortOrder', () => {
  const rows = [
    { _id: 'e1', sortOrder: 10 },
    { _id: 'e2', sortOrder: 20 },
    { _id: 'e3', sortOrder: 30 },
  ];
  assert.equal(computeInsertSortOrder(rows, 'e3', 'e1'), 10 - 1000);
  assert.equal(computeInsertSortOrder(rows, 'e1', 'e3'), (20 + 30) / 2);
  assert.equal(computeInsertSortOrder(rows, 'e1', 'e1'), null);
});

test('resolveListDropAction: Epic kéo dọc lên Epic khác → reorder-planning', () => {
  const epicA = {
    id: 'planning:e1',
    band: 0,
    kind: 'planning',
    workType: 'epic',
    raw: { _id: 'e1', sortOrder: 10 },
    children: [],
  };
  const epicB = {
    id: 'planning:e2',
    band: 0,
    kind: 'planning',
    workType: 'epic',
    raw: { _id: 'e2', sortOrder: 20 },
    children: [],
  };
  assert.equal(canListDragOver(epicB, epicA), true);
  assert.deepEqual(resolveListDropAction(epicB, epicA, [epicA, epicB]), {
    mode: 'reorder-planning',
    kind: 'planning',
    activeId: 'e2',
    overId: 'e1',
  });
});

test('buildListTree: Epic theo sortOrder', () => {
  const cfg = defaultWorkTypeConfig();
  const tree = buildListTree({
    epics: [
      { _id: 'e1', title: 'Later', type: 'epic', sortOrder: 20 },
      { _id: 'e2', title: 'First', type: 'epic', sortOrder: 10 },
    ],
    features: [],
    cards: [],
    config: cfg,
  });
  assert.equal(tree[0].raw._id, 'e2');
  assert.equal(tree[1].raw._id, 'e1');
  assert.ok(comparePlanningOrder({ sortOrder: 10 }, { sortOrder: 20 }) < 0);
});
