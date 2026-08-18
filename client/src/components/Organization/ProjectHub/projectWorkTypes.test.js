import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyWorkTypeDrag,
  childWorkTypeIdsForParent,
  createIssueTypeForChildWorkTypes,
  defaultWorkTypeConfig,
  depthDeltaFromPointerX,
  normalizeWorkTypeConfig,
  peerWorkTypeIds,
  reorderCreateTypes,
  toggleWorkTypeHidden,
  visibleCreateMenuTypes,
  visibleCreateTypes,
  visibleWorkTypeIds,
  workTypeTitleKey,
} from './projectWorkTypes.js';

test('normalizeWorkTypeConfig: bổ sung bug + bỏ id lạ + cây mặc định', () => {
  const cfg = normalizeWorkTypeConfig({
    createOrder: ['bug', 'story', 'epic', 'bug'],
    hidden: { bug: true, unknown: true },
  });
  assert.deepEqual(cfg.createOrder, ['bug', 'story', 'task']);
  assert.deepEqual(cfg.treeOrder.slice(0, 5), ['epic', 'feature', 'bug', 'story', 'task']);
  assert.equal(cfg.hidden.bug, true);
  assert.equal(cfg.hidden.story, false);
  assert.equal(cfg.hidden.unknown, undefined);
  assert.equal(cfg.depthById.epic, 0);
  assert.equal(cfg.depthById.story, cfg.depthById.bug);
});

test('visibleCreateTypes: thứ tự settings ∩ caps ∩ không ẩn', () => {
  const cfg = normalizeWorkTypeConfig({
    createOrder: ['bug', 'task', 'story'],
    hidden: { task: true },
  });
  assert.deepEqual(visibleCreateTypes(cfg, ['story', 'task', 'bug']), ['bug', 'story']);
  assert.deepEqual(visibleCreateTypes(cfg, ['story']), ['story']);
  assert.deepEqual(visibleCreateTypes(cfg, ['task']), []);
});

test('visibleCreateMenuTypes gồm Epic/Feature/Sub-task theo cây + caps', () => {
  const cfg = defaultWorkTypeConfig();
  assert.deepEqual(
    visibleCreateMenuTypes(cfg, {
      epic: true,
      feature: true,
      story: true,
      task: true,
      bug: true,
      subtask: true,
    }),
    ['epic', 'feature', 'story', 'task', 'bug', 'subtask']
  );
  const hiddenBug = normalizeWorkTypeConfig({
    ...cfg,
    hidden: { ...cfg.hidden, bug: true, feature: true },
  });
  assert.deepEqual(
    visibleCreateMenuTypes(hiddenBug, {
      epic: true,
      feature: true,
      story: true,
      task: false,
      bug: true,
      subtask: true,
    }),
    ['epic', 'story', 'subtask']
  );
});

test('reorderCreateTypes chỉ đổi cùng cấp story/task/bug trên cây', () => {
  const cfg = defaultWorkTypeConfig();
  const next = reorderCreateTypes(cfg, 'bug', 'story');
  assert.deepEqual(next.createOrder, ['bug', 'story', 'task']);
  assert.deepEqual(reorderCreateTypes(cfg, 'epic', 'story').createOrder, cfg.createOrder);
});

test('toggleWorkTypeHidden bật/tắt ẩn', () => {
  const cfg = defaultWorkTypeConfig();
  const hidden = toggleWorkTypeHidden(cfg, 'bug');
  assert.equal(hidden.hidden.bug, true);
  assert.equal(toggleWorkTypeHidden(hidden, 'bug').hidden.bug, false);
});

test('peerWorkTypeIds: story/task/bug mặc định cùng cấp', () => {
  const cfg = defaultWorkTypeConfig();
  assert.deepEqual(peerWorkTypeIds(cfg.treeOrder, cfg.depthById, 'story').sort(), ['bug', 'task']);
});

test('applyWorkTypeDrag: kéo ngang thụt Bug xuống dưới Task', () => {
  const cfg = defaultWorkTypeConfig();
  const next = applyWorkTypeDrag(cfg, { activeId: 'bug', overId: 'bug', deltaX: 48 });
  assert.ok(next.depthById.bug > next.depthById.story);
  assert.deepEqual(peerWorkTypeIds(next.treeOrder, next.depthById, 'story'), ['task']);
});

test('applyWorkTypeDrag: kéo ngang ra ngoài đưa Bug cùng cấp Feature', () => {
  const cfg = defaultWorkTypeConfig();
  const next = applyWorkTypeDrag(cfg, { activeId: 'bug', overId: 'bug', deltaX: -24 });
  assert.equal(next.depthById.bug, next.depthById.feature);
  assert.ok(peerWorkTypeIds(next.treeOrder, next.depthById, 'bug').includes('feature'));
});

test('depthDeltaFromPointerX: mỗi lần kéo chỉ ±1 bậc', () => {
  assert.equal(depthDeltaFromPointerX(8), 0);
  assert.equal(depthDeltaFromPointerX(24), 1);
  assert.equal(depthDeltaFromPointerX(96), 1);
  assert.equal(depthDeltaFromPointerX(-30), -1);
  assert.equal(depthDeltaFromPointerX(-120), -1);
});

test('visibleWorkTypeIds ẩn con khi collapse Feature', () => {
  const cfg = defaultWorkTypeConfig();
  const visible = visibleWorkTypeIds(cfg.treeOrder, cfg.depthById, { feature: true });
  assert.deepEqual(visible, ['epic', 'feature']);
});

test('T1 childWorkTypeIdsForParent: default task → subtask', () => {
  const cfg = defaultWorkTypeConfig();
  assert.deepEqual(childWorkTypeIdsForParent('task', cfg), ['subtask']);
  assert.equal(workTypeTitleKey('subtask'), 'workspace.projectHubWorkTypeSubtask');
  assert.equal(createIssueTypeForChildWorkTypes(['subtask']), 'task');
});

test('T2 childWorkTypeIdsForParent: screenshot story→task, task→subtask', () => {
  const cfg = normalizeWorkTypeConfig({
    treeOrder: ['epic', 'bug', 'feature', 'story', 'task', 'subtask'],
    depthById: { epic: 0, bug: 1, feature: 1, story: 1, task: 2, subtask: 3 },
  });
  assert.deepEqual(childWorkTypeIdsForParent('story', cfg), ['task']);
  assert.deepEqual(childWorkTypeIdsForParent('task', cfg), ['subtask']);
  assert.equal(createIssueTypeForChildWorkTypes(['task']), 'task');
});

test('T3 childWorkTypeIdsForParent: feature default → story/task/bug; subtask → []', () => {
  const cfg = defaultWorkTypeConfig();
  assert.deepEqual(childWorkTypeIdsForParent('feature', cfg).slice().sort(), ['bug', 'story', 'task']);
  assert.deepEqual(childWorkTypeIdsForParent('subtask', cfg), []);
});
