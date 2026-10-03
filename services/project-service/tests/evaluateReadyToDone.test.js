const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateReadyToDone } = require('../src/utils/work/evaluateReadyToDone');

describe('evaluateReadyToDone', () => {
  it('not ready when no active test cases', () => {
    const r = evaluateReadyToDone({ testCases: [], openBugs: [] });
    assert.equal(r.ready, false);
    assert.equal(r.reason, 'no_active_test_cases');
  });

  it('ignores obsolete and inactive', () => {
    const r = evaluateReadyToDone({
      testCases: [
        { lastResult: 'pass', status: 'obsolete', isActive: true },
        { lastResult: 'pass', status: 'ready', isActive: false },
      ],
      openBugs: [],
    });
    assert.equal(r.ready, false);
    assert.equal(r.reason, 'no_active_test_cases');
  });

  it('not ready when any active not pass', () => {
    const r = evaluateReadyToDone({
      testCases: [
        { lastResult: 'pass', status: 'ready', isActive: true },
        { lastResult: 'fail', status: 'ready', isActive: true },
      ],
      openBugs: [],
    });
    assert.equal(r.ready, false);
    assert.equal(r.reason, 'not_all_passed');
    assert.equal(r.passCount, 1);
    assert.equal(r.totalActive, 2);
  });

  it('not ready when open bugs', () => {
    const r = evaluateReadyToDone({
      testCases: [{ lastResult: 'pass', status: 'ready', isActive: true }],
      openBugs: [{ _id: 'b1' }],
    });
    assert.equal(r.ready, false);
    assert.equal(r.reason, 'open_bugs');
    assert.equal(r.openBugCount, 1);
  });

  it('ready when all active pass and no bugs', () => {
    const r = evaluateReadyToDone({
      testCases: [
        { lastResult: 'PASS', status: 'ready', isActive: true },
        { lastResult: 'pass', status: 'draft', isActive: true },
      ],
      openBugs: [],
    });
    assert.equal(r.ready, true);
    assert.equal(r.reason, null);
    assert.equal(r.passCount, 2);
    assert.equal(r.totalActive, 2);
  });
});
