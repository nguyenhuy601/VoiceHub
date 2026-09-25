const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateReleaseReady } = require('../src/utils/work/evaluateReleaseReady');

describe('evaluateReleaseReady', () => {
  const baseReady = {
    deliveryPhase: 'qa_uat',
    openBugCount: 0,
    linkedTestCases: [{ workItemId: 't1', lastResult: 'pass', isActive: true }],
    sprintCardsWithTc: [{ id: 't1', isDone: true, readyToDone: false }],
    pendingCrCount: 0,
  };

  it('not ready when wrong phase', () => {
    const r = evaluateReleaseReady({ ...baseReady, deliveryPhase: 'development' });
    assert.equal(r.ready, false);
    assert.equal(r.reason, 'wrong_phase');
    assert.ok(r.blockers.includes('wrong_phase'));
  });

  it('not ready when open bugs', () => {
    const r = evaluateReleaseReady({ ...baseReady, openBugCount: 2 });
    assert.equal(r.ready, false);
    assert.equal(r.reason, 'open_bugs');
  });

  it('not ready when no linked test cases', () => {
    const r = evaluateReleaseReady({
      ...baseReady,
      linkedTestCases: [],
      sprintCardsWithTc: [],
    });
    assert.equal(r.ready, false);
    assert.equal(r.reason, 'no_linked_test_cases');
  });

  it('not ready when TC not all pass', () => {
    const r = evaluateReleaseReady({
      ...baseReady,
      linkedTestCases: [
        { workItemId: 't1', lastResult: 'pass', isActive: true },
        { workItemId: 't2', lastResult: 'fail', isActive: true },
      ],
    });
    assert.equal(r.ready, false);
    assert.equal(r.reason, 'tc_not_pass');
    assert.equal(r.tcPassCount, 1);
    assert.equal(r.tcTotal, 2);
  });

  it('not ready when sprint card with TC pending', () => {
    const r = evaluateReleaseReady({
      ...baseReady,
      sprintCardsWithTc: [{ id: 't1', isDone: false, readyToDone: false }],
    });
    assert.equal(r.ready, false);
    assert.equal(r.reason, 'cards_pending');
  });

  it('ready when card not done but readyToDone', () => {
    const r = evaluateReleaseReady({
      ...baseReady,
      sprintCardsWithTc: [{ id: 't1', isDone: false, readyToDone: true }],
    });
    assert.equal(r.ready, true);
  });

  it('not ready when pending approved CR', () => {
    const r = evaluateReleaseReady({ ...baseReady, pendingCrCount: 1 });
    assert.equal(r.ready, false);
    assert.equal(r.reason, 'pending_crs');
  });

  it('ready when all criteria met', () => {
    const r = evaluateReleaseReady(baseReady);
    assert.equal(r.ready, true);
    assert.equal(r.reason, null);
    assert.deepEqual(r.blockers, []);
  });

  it('ignores obsolete TC', () => {
    const r = evaluateReleaseReady({
      ...baseReady,
      linkedTestCases: [
        { workItemId: 't1', lastResult: 'pass', isActive: true },
        { workItemId: 't2', lastResult: 'fail', status: 'obsolete', isActive: true },
      ],
    });
    assert.equal(r.ready, true);
    assert.equal(r.tcTotal, 1);
  });
});
