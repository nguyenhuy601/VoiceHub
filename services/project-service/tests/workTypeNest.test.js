const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveCardWorkType,
  assertChildUnderParentType,
} = require('../src/services/workTypeNest.service');
const {
  defaultWorkTypeConfig,
  normalizeWorkTypeConfig,
} = require('../src/utils/workTypeConfig');

const screenshotTree = normalizeWorkTypeConfig({
  treeOrder: ['epic', 'bug', 'feature', 'story', 'task', 'subtask'],
  depthById: { epic: 0, bug: 1, feature: 1, story: 1, task: 2, subtask: 3 },
});

describe('workTypeNest', () => {
  it('resolveCardWorkType: task dưới task → subtask', () => {
    assert.equal(resolveCardWorkType({ issueType: 'task' }, null), 'task');
    assert.equal(
      resolveCardWorkType({ issueType: 'task' }, { issueType: 'task' }),
      'subtask'
    );
    assert.equal(
      resolveCardWorkType({ issueType: 'task' }, { issueType: 'story' }),
      'task'
    );
  });

  it('default: task→feature ok; task→story = subtask fallback; bug→story deny', () => {
    const cfg = defaultWorkTypeConfig();
    assert.doesNotThrow(() => assertChildUnderParentType('task', 'feature', cfg));
    assert.doesNotThrow(() => assertChildUnderParentType('subtask', 'story', cfg));
    assert.doesNotThrow(() => assertChildUnderParentType('subtask', 'task', cfg));
    assert.doesNotThrow(() => assertChildUnderParentType('task', 'story', cfg));
    assert.throws(() => assertChildUnderParentType('bug', 'story', cfg), /cấp/);
    assert.throws(() => assertChildUnderParentType('story', 'task', cfg), /cấp/);
  });

  it('screenshot tree: task→story/bug/feature ok; task→epic deny; bug→epic ok', () => {
    assert.doesNotThrow(() => assertChildUnderParentType('task', 'story', screenshotTree));
    assert.doesNotThrow(() => assertChildUnderParentType('task', 'bug', screenshotTree));
    assert.doesNotThrow(() => assertChildUnderParentType('task', 'feature', screenshotTree));
    assert.throws(() => assertChildUnderParentType('task', 'epic', screenshotTree), /cấp/);
    assert.doesNotThrow(() => assertChildUnderParentType('bug', 'epic', screenshotTree));
    assert.doesNotThrow(() => assertChildUnderParentType('subtask', 'task', screenshotTree));
  });
});
