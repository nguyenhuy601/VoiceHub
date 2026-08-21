const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isInProgressLikeStatus,
  maybeFirstInProgressPatch,
} = require('../src/utils/taskCycleTime');

describe('taskCycleTime', () => {
  it('detects in-progress statuses', () => {
    assert.equal(isInProgressLikeStatus('doing'), true);
    assert.equal(isInProgressLikeStatus('in_progress'), true);
    assert.equal(isInProgressLikeStatus('review'), true);
    assert.equal(isInProgressLikeStatus('todo'), false);
    assert.equal(isInProgressLikeStatus('done'), false);
    assert.equal(isInProgressLikeStatus('qa', 'in_progress'), true);
    assert.equal(isInProgressLikeStatus('custom', 'done'), false);
  });

  it('sets firstInProgressAt only once on first in-progress', () => {
    const patch = maybeFirstInProgressPatch({ status: 'todo' }, 'doing', {
      at: new Date('2026-08-01T00:00:00.000Z'),
    });
    assert.ok(patch?.firstInProgressAt);
    assert.equal(patch.firstInProgressAt.toISOString(), '2026-08-01T00:00:00.000Z');

    const again = maybeFirstInProgressPatch(
      { status: 'doing', firstInProgressAt: patch.firstInProgressAt },
      'review'
    );
    assert.equal(again, null);

    const fromTodo = maybeFirstInProgressPatch({ status: 'todo' }, 'todo');
    assert.equal(fromTodo, null);
  });
});
