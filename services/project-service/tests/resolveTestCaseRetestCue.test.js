const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveTestCaseRetestCue,
} = require('../src/utils/work/resolveTestCaseRetestCue');

describe('resolveTestCaseRetestCue', () => {
  it('no bug → no cue', () => {
    const r = resolveTestCaseRetestCue({ lastResult: 'fail', hasLinkedBug: false });
    assert.equal(r.cue, null);
    assert.equal(r.needsRetest, false);
  });

  it('fail + open bug + parent not on QA → bug_open', () => {
    const r = resolveTestCaseRetestCue({
      lastResult: 'fail',
      hasLinkedBug: true,
      linkedBugDone: false,
      parentReadyForQa: false,
    });
    assert.equal(r.cue, 'bug_open');
    assert.equal(r.linkedBugOpen, true);
    assert.equal(r.needsRetest, false);
  });

  it('fail + bug Done → needs_retest', () => {
    const r = resolveTestCaseRetestCue({
      lastResult: 'fail',
      hasLinkedBug: true,
      linkedBugDone: true,
    });
    assert.equal(r.cue, 'needs_retest');
    assert.equal(r.needsRetest, true);
    assert.equal(r.linkedBugOpen, false);
  });

  it('fail + open bug + parent on Ready for QA → needs_retest', () => {
    const r = resolveTestCaseRetestCue({
      lastResult: 'fail',
      hasLinkedBug: true,
      linkedBugDone: false,
      parentReadyForQa: true,
    });
    assert.equal(r.cue, 'needs_retest');
    assert.equal(r.needsRetest, true);
    assert.equal(r.linkedBugOpen, true);
  });

  it('pass + bug Done → no retest cue', () => {
    const r = resolveTestCaseRetestCue({
      lastResult: 'pass',
      hasLinkedBug: true,
      linkedBugDone: true,
      parentReadyForQa: true,
    });
    assert.equal(r.cue, null);
    assert.equal(r.needsRetest, false);
    assert.equal(r.linkedBugDone, true);
  });

  it('pass + bug still open → no bug_open chip', () => {
    const r = resolveTestCaseRetestCue({
      lastResult: 'pass',
      hasLinkedBug: true,
      linkedBugDone: false,
      parentReadyForQa: true,
    });
    assert.equal(r.cue, null);
    assert.equal(r.linkedBugOpen, false);
    assert.equal(r.needsRetest, false);
  });
});
