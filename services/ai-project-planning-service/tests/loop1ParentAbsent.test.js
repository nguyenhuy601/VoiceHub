const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLoop1ChildHistory,
  hasLoop1ChildTriad,
  HISTORY_EVENTS,
} = require('../src/contracts/loopStateContract');
const {
  classifyCheckpointLifecycle,
  LIFECYCLE,
} = require('../src/checkpoint/checkpointLifecycle');
const { normalizeAgentState } = require('../src/checkpoint/agentStateSchema');

/**
 * T1 — Parent completed → CP deleted; Gate1 revise still seeds child history triad.
 * (No parent CP resurrect.)
 */
describe('loop1ParentAbsent T1', () => {
  it('parent completed is TERMINAL (checkpoint should be deleted)', () => {
    assert.equal(
      classifyCheckpointLifecycle({ status: 'completed' }),
      LIFECYCLE.TERMINAL
    );
  });

  it('child AgentState seeds triad + parentRunId without parent CP', () => {
    const parentRunId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const childRunId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const history = buildLoop1ChildHistory();
    assert.equal(hasLoop1ChildTriad(history), true);
    assert.ok(history.includes(HISTORY_EVENTS.GATE1_REJECT));

    const state = normalizeAgentState({
      runId: childRunId,
      parentRunId,
      generationId: childRunId,
      history,
      humanFeedback: {
        kind: 'requirement_feedback',
        source: 'gate1',
        rawText: 'thiếu NFR',
      },
      goal: 'phase_what_understanding',
      currentGoal: 'Gate1 Loop1 revise: thiếu NFR',
      constraints: [{ type: 'loop1_feedback', text: 'thiếu NFR' }],
      toolResults: [],
    });

    assert.equal(state.parentRunId, parentRunId);
    assert.equal(state.generationId, childRunId);
    assert.equal(hasLoop1ChildTriad(state.history), true);
    assert.equal(state.humanFeedback.source, 'gate1');
  });
});
