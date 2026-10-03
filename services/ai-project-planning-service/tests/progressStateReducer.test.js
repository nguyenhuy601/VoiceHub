const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  reduceProgressState,
  resetStaleProgressEventTotalForTests,
  getStaleProgressEventTotal,
} = require('../src/run/progressStateReducer');

describe('progressStateReducer', () => {
  beforeEach(() => {
    resetStaleProgressEventTotalForTests();
  });

  it('T1 explicit event persists parse', () => {
    const r = reduceProgressState({}, { step: 2, substep: 'parse', seq: 1 });
    assert.equal(r.action, 'apply');
    assert.equal(r.next.pipelineSubstep, 'parse');
    assert.equal(r.next.pipelineStep, 2);
    assert.equal(r.next.progressVersion, 1);
  });

  it('T2 node-only updates currentNode only', () => {
    const base = {
      pipelineStep: 1,
      pipelineSubstep: 'prepare',
      progressVersion: 1,
    };
    const r = reduceProgressState(base, { node: 'understand', seq: 2 });
    assert.equal(r.action, 'apply');
    assert.equal(r.next.pipelineSubstep, 'prepare');
    assert.equal(r.next.currentNode, 'understand');
  });

  it('T3 node after parse keeps parse', () => {
    const base = {
      pipelineStep: 2,
      pipelineSubstep: 'parse',
      progressVersion: 5,
      currentNode: 'execute',
    };
    const r = reduceProgressState(base, { node: 'execute', tool: 'RequirementAnalysisTool', seq: 6 });
    assert.equal(r.next.pipelineSubstep, 'parse');
    assert.equal(r.next.currentTool, 'RequirementAnalysisTool');
  });

  it('T4 out-of-order seq ignored', () => {
    let state = {};
    let r = reduceProgressState(state, { step: 2, substep: 'parse', seq: 10 });
    state = r.next;
    r = reduceProgressState(state, { step: 2, substep: 'quality', seq: 11 });
    state = r.next;
    r = reduceProgressState(state, { step: 1, substep: 'prepare', seq: 9 });
    assert.equal(r.action, 'ignore');
    assert.equal(r.reason, 'stale_seq');
    assert.equal(state.pipelineSubstep, 'quality');
    assert.ok(getStaleProgressEventTotal() >= 1);
  });

  it('T5 duplicate seq is idempotent', () => {
    const base = {
      pipelineStep: 2,
      pipelineSubstep: 'quality',
      progressVersion: 11,
    };
    const r = reduceProgressState(base, { step: 2, substep: 'quality', seq: 11 });
    assert.equal(r.action, 'idempotent');
    assert.equal(r.next.pipelineSubstep, 'quality');
  });

  it('T6 waiting_human status hint does not clear substep', () => {
    const base = {
      pipelineStep: 2,
      pipelineSubstep: 'gate_preview',
      progressVersion: 3,
    };
    const r = reduceProgressState(base, {
      step: 2,
      substep: 'gate_preview',
      status: 'waiting_human',
      seq: 4,
    });
    assert.equal(r.action, 'apply');
    assert.equal(r.next.pipelineSubstep, 'gate_preview');
    assert.equal(r.next.statusHint, 'waiting_human');
  });

  it('auto-assigns seq when missing', () => {
    const r = reduceProgressState({ progressVersion: 2 }, { node: 'plan' });
    assert.equal(r.action, 'apply');
    assert.equal(r.next.progressVersion, 3);
    assert.equal(r.next.currentNode, 'plan');
  });
});
