import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultWorkTypeConfig, normalizeWorkTypeConfig } from './projectWorkTypes.js';
import {
  buildListTree,
  buildBacklogTree,
  canListDragOver,
  childTypesForParent,
  comparePlanningOrder,
  computeInsertSortOrder,
  hierarchyBands,
  isBacklogLevelTwoIssue,
  isBoardSprintReady,
  isLiveListDragValid,
  isTypePreservingDrop,
  preferListHorizontalDrag,
  resolveBoardCreateParent,
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

test('resolveBoardCreateParent: Story→Task (screenshot); Feature→Task; Epic→Bug; orphan rỗng', () => {
  const screenshot = normalizeWorkTypeConfig({
    treeOrder: ['epic', 'bug', 'feature', 'story', 'task', 'subtask'],
    depthById: { epic: 0, bug: 1, feature: 1, story: 1, task: 2, subtask: 3 },
  });
  assert.deepEqual(
    resolveBoardCreateParent({
      type: 'task',
      parentNode: {
        kind: 'card',
        workType: 'story',
        raw: { _id: 's1', epicId: 'e1', issueType: 'story' },
      },
      config: screenshot,
    }),
    { parentTaskId: 's1', epicId: 'e1' }
  );
  assert.deepEqual(
    resolveBoardCreateParent({
      type: 'task',
      parentNode: {
        kind: 'planning',
        workType: 'feature',
        raw: { _id: 'f1', parentId: 'e1', type: 'feature' },
      },
      config: screenshot,
    }),
    { featureId: 'f1', epicId: 'e1' }
  );
  assert.deepEqual(
    resolveBoardCreateParent({
      type: 'bug',
      parentNode: { kind: 'planning', workType: 'epic', raw: { _id: 'e1', type: 'epic' } },
      config: screenshot,
    }),
    { epicId: 'e1' }
  );
  assert.deepEqual(resolveBoardCreateParent({ type: 'task', parentNode: null, config: screenshot }), {});
});

test('buildListTree: Feature chứa card theo featureId', () => {
  const cfg = defaultWorkTypeConfig();
  const tree = buildListTree({
    epics: [{ _id: 'e1', title: 'Epic 1', type: 'epic' }],
    features: [{ _id: 'f1', title: 'Feat', type: 'feature', parentId: 'e1' }],
    cards: [{ _id: 'c1', title: 'Task under feat', issueType: 'task', featureId: 'f1', epicId: 'e1' }],
    config: cfg,
  });
  assert.equal(tree.length, 1);
  const featureNode = tree[0].children.find((n) => n.workType === 'feature');
  assert.ok(featureNode);
  assert.equal(featureNode.children.length, 1);
  assert.equal(featureNode.children[0].raw._id, 'c1');
  const epicDirectCards = tree[0].children.filter((n) => n.kind === 'card');
  assert.equal(epicDirectCards.length, 0);
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

test('buildBacklogTree: default config => task featureId là child của feature; subtask là child của task', () => {
  const cfg = defaultWorkTypeConfig();
  const { roots } = buildBacklogTree({
    epics: [{ _id: 'e1', title: 'Epic 1', type: 'epic' }],
    features: [{ _id: 'f1', title: 'Feature 1', type: 'feature', parentId: 'e1' }],
    cards: [
      { _id: 'c1', title: 'Task under feature', issueType: 'task', featureId: 'f1', epicId: 'e1', sprintId: null },
      { _id: 's1', title: 'Sub-task', issueType: 'task', parentTaskId: 'c1', epicId: 'e1', sprintId: null },
    ],
    config: cfg,
    sprintId: null,
  });

  const byId = new Map(roots.map((r) => [String(r.issue?._id || r.issue?.id), r]));
  const rootFeature = byId.get('f1');
  assert.ok(rootFeature);
  assert.equal(byId.has('c1'), false);
  assert.equal(rootFeature.children.length, 1);
  assert.equal(rootFeature.children[0]._id, 'c1');
  assert.equal(rootFeature.children[0].issueType, 'task');
});

test('buildBacklogTree: screenshot config (ẩn subtask) => task là cấp 3 child của feature', () => {
  const cfg = normalizeWorkTypeConfig({
    ...defaultWorkTypeConfig(),
    hidden: { ...defaultWorkTypeConfig().hidden, subtask: true },
  });

  const { roots } = buildBacklogTree({
    epics: [{ _id: 'e1', title: 'Epic 1', type: 'epic' }],
    features: [{ _id: 'f1', title: 'Feature 1', type: 'feature', parentId: 'e1' }],
    cards: [{ _id: 'c1', title: 'Task under feature', issueType: 'task', featureId: 'f1', epicId: 'e1', sprintId: null }],
    config: cfg,
    sprintId: null,
  });

  assert.equal(roots.length, 1);
  assert.equal(roots[0].issue._id, 'f1');
  assert.equal(roots[0].children.length, 1);
  assert.equal(roots[0].children[0]._id, 'c1');
  assert.equal(roots[0].children[0].issueType, 'task');
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

const screenshotTree = normalizeWorkTypeConfig({
  treeOrder: ['epic', 'bug', 'feature', 'story', 'task', 'subtask'],
  depthById: { epic: 0, bug: 1, feature: 1, story: 1, task: 2, subtask: 3 },
});

test('buildBacklogTree: screenshot depth (subtask hiện) => task vẫn child của feature, không thành root', () => {
  const { roots } = buildBacklogTree({
    epics: [{ _id: 'e1', title: 'Epic 1', type: 'epic' }],
    features: [{ _id: 'f1', title: 'CRUD sách', type: 'feature', parentId: 'e1' }],
    cards: [
      { _id: 'c1', title: 'API: tạo', issueType: 'task', featureId: 'f1', epicId: 'e1', sprintId: null },
      { _id: 's1', title: 'Sub', issueType: 'task', parentTaskId: 'c1', featureId: 'f1', epicId: 'e1', sprintId: null },
    ],
    config: screenshotTree,
    sprintId: null,
  });

  assert.equal(roots.length, 1);
  assert.equal(roots[0].issue._id, 'f1');
  assert.equal(roots[0].children.length, 1);
  assert.equal(roots[0].children[0]._id, 'c1');
  assert.equal(
    (roots[0].children[0].children || []).some((c) => c._id === 's1'),
    false
  );
});

test('canListDragOver: cùng cấp hoặc lên bất kỳ cấp cao hơn, không xuống cấp', () => {
  const cfg = defaultWorkTypeConfig();
  const epic = {
    id: 'planning:e1',
    band: 0,
    workType: 'epic',
    children: [{ id: 'card:c1', band: 1, children: [] }],
  };
  const task = {
    id: 'card:c1',
    band: 1,
    workType: 'task',
    children: [{ id: 'card:s1', band: 2, children: [] }],
  };
  const sub = { id: 'card:s1', band: 2, workType: 'subtask', children: [] };
  const task2 = { id: 'card:c2', band: 1, workType: 'task', children: [] };
  assert.equal(canListDragOver(sub, task, cfg), true);
  assert.equal(canListDragOver(sub, task2, cfg), true);
  assert.equal(canListDragOver(sub, epic, cfg), true);
  assert.equal(canListDragOver(task, epic, cfg), true);
  assert.equal(canListDragOver(task, task2, cfg), true);
  assert.equal(canListDragOver(epic, task, cfg), false);
  assert.equal(canListDragOver(task, sub, cfg), false);
  assert.equal(canListDragOver(task, { id: 'card:c1', band: 1, workType: 'task', children: [] }, cfg), false);
});

test('resolveListDropAction: subtask → task parent; Task → Epic allowed', () => {
  const cfg = defaultWorkTypeConfig();
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
  assert.deepEqual(resolveListDropAction(sub, task, [], cfg), {
    mode: 'attach-card-parent',
    kind: 'card',
    activeId: 's1',
    parentTaskId: 'c1',
    epicId: 'e1',
  });
  assert.deepEqual(resolveListDropAction(task, epic, [], cfg), {
    mode: 'attach-card-epic',
    kind: 'card',
    activeId: 'c1',
    epicId: 'e1',
    parentTaskId: null,
  });
});

test('resolveListHorizontalAction: Task indent Task → allowed; outdent sub → sibling', () => {
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

  assert.equal(canListDragOver(feature, epic, cfg), true);
  assert.deepEqual(resolveListDropAction(feature, epic, tree, cfg), {
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
  assert.equal(canListDragOver(epic, feature, cfg), false);
});

test('preferListHorizontalDrag: chỉ khi |X| ≥ |Y| và đủ ngưỡng indent', () => {
  assert.equal(preferListHorizontalDrag(48, 8), true);
  assert.equal(preferListHorizontalDrag(48, 80), false);
  assert.equal(preferListHorizontalDrag(8, 8), false);
  assert.equal(preferListHorizontalDrag(30, 30), true);
});

test('resolveListDropAction: Story thả dọc vào Feature trong Epic → gắn epic (1 cấp)', () => {
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

  assert.equal(canListDragOver(orphanStory, feature, cfg), true);
  assert.deepEqual(resolveListDropAction(orphanStory, feature, tree, cfg), {
    mode: 'attach-card-feature',
    kind: 'card',
    activeId: 'c2',
    featureId: 'f1',
    epicId: 'e1',
    parentTaskId: null,
  });
  assert.deepEqual(resolveListDropAction(orphanStory, nestedStory, tree, cfg), {
    mode: 'attach-card-epic',
    kind: 'card',
    activeId: 'c2',
    epicId: 'e1',
    parentTaskId: null,
  });
  assert.deepEqual(resolveListDropAction(orphanStory, epic, tree, cfg), {
    mode: 'attach-card-epic',
    kind: 'card',
    activeId: 'c2',
    epicId: 'e1',
    parentTaskId: null,
  });
  assert.equal(resolveListDropAction(nestedStory, feature, tree, cfg)?.mode, 'attach-card-feature');
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
  assert.equal(canListDragOver(epicB, epicA, defaultWorkTypeConfig()), true);
  assert.deepEqual(resolveListDropAction(epicB, epicA, [epicA, epicB], defaultWorkTypeConfig()), {
    mode: 'reorder-planning',
    kind: 'planning',
    activeId: 'e2',
    overId: 'e1',
  });
});

test('isTypePreservingDrop / isLiveListDragValid: sub-task đổi parent; Task nest vào Task cho phép', () => {
  const cfg = defaultWorkTypeConfig();
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
    raw: { _id: 'c1', issueType: 'task', epicId: 'e1' },
    children: [],
  };
  const task2 = {
    id: 'card:c2',
    band: 1,
    kind: 'card',
    workType: 'task',
    raw: { _id: 'c2', issueType: 'task', epicId: 'e1' },
    children: [],
  };
  const sub = {
    id: 'card:s1',
    band: 2,
    kind: 'card',
    workType: 'subtask',
    raw: { _id: 's1', parentTaskId: 'c1', issueType: 'task', epicId: 'e1' },
    children: [],
  };
  task.children = [sub];
  epic.children = [task, task2];
  const tree = [epic];
  const flatRows = [
    { node: epic, depth: 0 },
    { node: task, depth: 1 },
    { node: sub, depth: 2 },
    { node: task2, depth: 1 },
  ];

  const reparent = resolveListDropAction(sub, task2, tree, cfg);
  assert.deepEqual(reparent, {
    mode: 'attach-card-parent',
    kind: 'card',
    activeId: 's1',
    parentTaskId: 'c2',
    epicId: 'e1',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(reparent, 'issueType'), false);
  assert.equal(isTypePreservingDrop(sub, reparent), true);

  const sameBand = resolveListDropAction(task2, task, tree, cfg);
  assert.equal(sameBand?.mode, 'noop');
  assert.equal(Object.prototype.hasOwnProperty.call(sameBand || {}, 'parentTaskId'), false);
  assert.equal(
    isLiveListDragValid({
      activeNode: task2,
      overNode: task,
      deltaX: 48,
      deltaY: 4,
      tree,
      flatRows,
      config: cfg,
    }),
    true
  );
  assert.equal(
    isLiveListDragValid({
      activeNode: sub,
      overNode: task2,
      deltaX: 0,
      deltaY: 40,
      tree,
      flatRows,
      config: cfg,
    }),
    true
  );
  assert.equal(
    isLiveListDragValid({
      activeNode: task2,
      overNode: epic,
      deltaX: 0,
      deltaY: 40,
      tree,
      flatRows,
      config: cfg,
    }),
    true
  );
});

test('buildListTree: default Task dưới Story hiện subtask (cùng depth task/story)', () => {
  const cfg = defaultWorkTypeConfig();
  const tree = buildListTree({
    epics: [{ _id: 'e1', title: 'Epic 1', type: 'epic' }],
    features: [],
    cards: [
      { _id: 's1', title: 'Story', issueType: 'story', epicId: 'e1' },
      { _id: 't1', title: 'Sub', issueType: 'task', parentTaskId: 's1', epicId: 'e1' },
    ],
    config: cfg,
  });
  assert.equal(tree[0].children[0].workType, 'story');
  assert.equal(tree[0].children[0].children[0].workType, 'subtask');
});

test('buildListTree: Task dưới Story giữ issueType task, không icon subtask', () => {
  const cfg = screenshotTree;
  const tree = buildListTree({
    epics: [{ _id: 'e1', title: 'Epic 1', type: 'epic' }],
    features: [],
    cards: [
      { _id: 's1', title: 'Story', issueType: 'story', epicId: 'e1' },
      { _id: 't1', title: 'Task', issueType: 'task', parentTaskId: 's1', epicId: 'e1' },
    ],
    config: cfg,
  });
  assert.equal(tree[0].children[0].workType, 'story');
  assert.equal(tree[0].children[0].children[0].workType, 'task');
  assert.equal(tree[0].children[0].children[0].raw.issueType, 'task');
});

test('cây hình: Task→Story/Bug nest; Bug→Story deny; Bug→Epic ok; Task→Epic deny', () => {
  const cfg = screenshotTree;
  const epic = {
    id: 'planning:e1',
    band: 0,
    kind: 'planning',
    workType: 'epic',
    raw: { _id: 'e1' },
    children: [],
  };
  const story = {
    id: 'card:s1',
    band: 1,
    kind: 'card',
    workType: 'story',
    raw: { _id: 's1', issueType: 'story', epicId: 'e1' },
    children: [],
  };
  const bug = {
    id: 'card:b1',
    band: 1,
    kind: 'card',
    workType: 'bug',
    raw: { _id: 'b1', issueType: 'bug', epicId: 'e1' },
    children: [],
  };
  const task = {
    id: 'card:t1',
    band: 1,
    kind: 'card',
    workType: 'task',
    raw: { _id: 't1', issueType: 'task', epicId: 'e1' },
    children: [],
  };
  epic.children = [story, bug];

  assert.equal(canListDragOver(task, story, cfg), true);
  assert.deepEqual(resolveListDropAction(task, story, [epic, task], cfg), {
    mode: 'attach-card-parent',
    kind: 'card',
    activeId: 't1',
    parentTaskId: 's1',
    epicId: 'e1',
  });
  assert.equal(Object.prototype.hasOwnProperty.call(resolveListDropAction(task, story, [epic, task], cfg), 'issueType'), false);

  assert.equal(canListDragOver(task, bug, cfg), true);
  assert.equal(resolveListDropAction(task, bug, [epic, task], cfg)?.mode, 'attach-card-parent');

  assert.equal(canListDragOver(bug, story, cfg), true);
  assert.equal(resolveListDropAction(bug, story, [epic], cfg), null);

  assert.equal(canListDragOver(bug, epic, cfg), true);
  assert.deepEqual(resolveListDropAction(bug, epic, [epic], cfg), {
    mode: 'attach-card-epic',
    kind: 'card',
    activeId: 'b1',
    epicId: 'e1',
    parentTaskId: null,
  });

  assert.equal(canListDragOver(task, epic, cfg), true);
  assert.deepEqual(resolveListDropAction(task, epic, [epic], cfg), {
    mode: 'attach-card-epic',
    kind: 'card',
    activeId: 't1',
    epicId: 'e1',
    parentTaskId: null,
  });

  assert.equal(
    isLiveListDragValid({
      activeNode: task,
      overNode: story,
      deltaX: 0,
      deltaY: 40,
      tree: [epic, task],
      config: cfg,
    }),
    true
  );
  assert.equal(
    isLiveListDragValid({
      activeNode: bug,
      overNode: story,
      deltaX: 0,
      deltaY: 40,
      tree: [epic],
      config: cfg,
    }),
    false
  );
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
