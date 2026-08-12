const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeWorkTypeConfig,
  assertNestByDepth,
  defaultWorkTypeConfig,
  serializeWorkTypeConfig,
} = require('../src/utils/workTypeConfig');

const screenshotTree = normalizeWorkTypeConfig({
  treeOrder: ['epic', 'bug', 'feature', 'story', 'task', 'subtask'],
  depthById: { epic: 0, bug: 1, feature: 1, story: 1, task: 2, subtask: 3 },
});

describe('workTypeConfig nest depth', () => {
  it('default: story/task/bug cùng cấp', () => {
    const cfg = defaultWorkTypeConfig();
    assert.equal(cfg.depthById.story, 2);
    assert.equal(cfg.depthById.task, 2);
    assert.equal(cfg.depthById.bug, 2);
    assert.equal(assertNestByDepth('task', 'story', cfg).ok, false);
    assert.equal(assertNestByDepth('task', 'epic', cfg).ok, false);
    assert.equal(assertNestByDepth('subtask', 'task', cfg).ok, true);
    assert.equal(assertNestByDepth('subtask', 'story', cfg).ok, true);
  });

  it('cây hình: Task → Story/Bug ok; Bug → Story deny; Bug → Epic ok; Task → Epic deny', () => {
    assert.equal(assertNestByDepth('task', 'story', screenshotTree).ok, true);
    assert.equal(assertNestByDepth('task', 'bug', screenshotTree).ok, true);
    assert.equal(assertNestByDepth('bug', 'story', screenshotTree).ok, false);
    assert.equal(assertNestByDepth('bug', 'epic', screenshotTree).ok, true);
    assert.equal(assertNestByDepth('task', 'epic', screenshotTree).ok, false);
    assert.equal(assertNestByDepth('feature', 'epic', screenshotTree).ok, true);
    assert.equal(assertNestByDepth('subtask', 'task', screenshotTree).ok, true);
  });

  it('normalize fills missing keys', () => {
    const cfg = normalizeWorkTypeConfig({ depthById: { epic: 0, story: 1 } });
    assert.ok(cfg.treeOrder.includes('task'));
    assert.equal(typeof cfg.depthById.subtask, 'number');
  });

  it('serialize: null khi chưa lưu', () => {
    assert.equal(serializeWorkTypeConfig(null), null);
    assert.equal(serializeWorkTypeConfig(undefined), null);
    assert.equal(serializeWorkTypeConfig(screenshotTree).depthById.story, 1);
  });
});
