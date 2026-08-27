import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultWorkTypeConfig, normalizeWorkTypeConfig } from '../projectWorkTypes.js';
import {
  buildTabVisibilityContext,
  clampActiveTab,
  listVisibleTabIds,
  pickInitialVisibleTab,
} from './workItemDetailTabs.js';
import { mapInitialPanelToTab } from './workItemDetailUtils.js';

test('epic có children tab; subtask không', () => {
  const cfg = defaultWorkTypeConfig();
  const epicCtx = buildTabVisibilityContext({
    workItem: { issueType: 'epic', kind: 'planning' },
    workTypeConfig: cfg,
  });
  assert.ok(listVisibleTabIds(epicCtx).includes('children'));

  const subCtx = buildTabVisibilityContext({
    workItem: { issueType: 'subtask', parentTaskId: 'p1' },
    workTypeConfig: cfg,
    boardCards: [{ _id: 'p1', issueType: 'task' }],
  });
  assert.equal(subCtx.workType, 'subtask');
  assert.ok(!listVisibleTabIds(subCtx).includes('children'));
});

test('feature (kind=planning) ẩn attachments', () => {
  const ctx = buildTabVisibilityContext({
    workItem: { kind: 'planning', type: 'feature', issueType: 'feature' },
    workTypeConfig: defaultWorkTypeConfig(),
  });
  assert.equal(ctx.kind, 'planning');
  const ids = listVisibleTabIds(ctx);
  assert.ok(!ids.includes('attachments'));
  assert.ok(!ids.includes('worklog'));
  assert.ok(!ids.includes('approvals'));
  assert.ok(ids.includes('overview'));
  assert.ok(ids.includes('activity'));
});

test('time-tracking flag bật mới có worklog', () => {
  const base = {
    workItem: { issueType: 'story' },
    workTypeConfig: defaultWorkTypeConfig(),
    canEstimate: true,
  };
  const off = buildTabVisibilityContext({ ...base, timeTrackingEnabled: false });
  assert.ok(!listVisibleTabIds(off).includes('worklog'));

  const on = buildTabVisibilityContext({ ...base, timeTrackingEnabled: true });
  assert.ok(listVisibleTabIds(on).includes('worklog'));
});

test('story có children theo depth config cafe-like', () => {
  const cfg = normalizeWorkTypeConfig({
    treeOrder: ['epic', 'bug', 'feature', 'story', 'task', 'subtask'],
    depthById: {
      epic: 0,
      feature: 1,
      story: 1,
      task: 2,
      bug: 1,
      subtask: 3,
    },
  });
  const storyCtx = buildTabVisibilityContext({
    workItem: { issueType: 'story' },
    workTypeConfig: cfg,
  });
  assert.deepEqual(storyCtx.childTypeIds, ['task']);
  assert.ok(listVisibleTabIds(storyCtx).includes('children'));

  const taskCtx = buildTabVisibilityContext({
    workItem: { issueType: 'task' },
    workTypeConfig: cfg,
  });
  assert.deepEqual(taskCtx.childTypeIds, ['subtask']);
  assert.ok(listVisibleTabIds(taskCtx).includes('children'));
});

test('mapInitialPanelToTab + pickInitialVisibleTab', () => {
  assert.equal(mapInitialPanelToTab('attach'), 'attachments');
  assert.equal(mapInitialPanelToTab('labels'), 'overview');
  assert.equal(mapInitialPanelToTab('dates'), 'overview');
  assert.equal(mapInitialPanelToTab('members'), 'overview');
  assert.equal(mapInitialPanelToTab('detail'), 'overview');

  const ctx = buildTabVisibilityContext({
    workItem: { issueType: 'subtask', parentTaskId: 'p1' },
    workTypeConfig: defaultWorkTypeConfig(),
    boardCards: [{ _id: 'p1', issueType: 'task' }],
    timeTrackingEnabled: false,
  });
  assert.equal(pickInitialVisibleTab(ctx, 'children'), 'overview');
  assert.equal(pickInitialVisibleTab(ctx, 'attachments'), 'attachments');
});

test('clampActiveTab giữ tab hiện tại; không nhảy về preferred nếu vẫn visible', () => {
  const ids = ['overview', 'description', 'activity', 'attachments'];
  assert.equal(clampActiveTab('activity', ids, 'overview'), 'activity');
  assert.equal(clampActiveTab('description', ids, 'activity'), 'description');
  assert.equal(clampActiveTab('worklog', ids, 'activity'), 'activity');
  assert.equal(clampActiveTab('worklog', ids, 'missing'), 'overview');
  assert.equal(clampActiveTab('x', [], 'overview'), 'overview');
});
