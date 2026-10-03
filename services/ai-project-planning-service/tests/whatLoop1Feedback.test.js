const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseFeedback } = require('../src/feedback/feedbackParser');
const { buildInitialAgentFields } = require('../src/checkpoint/agentStateSchema');
const {
  buildLoop1ChildHistory,
  hasLoop1ChildTriad,
  HISTORY_EVENTS,
} = require('../src/contracts/loopStateContract');

describe('whatLoop1Feedback', () => {
  it('parses Gate1 reject text as requirement_feedback source=gate1', () => {
    const parsed = parseFeedback({
      kind: 'requirement_feedback',
      text: 'FR-2 thiếu actor — bổ sung rõ actor BA',
    });
    assert.equal(parsed.kind, 'requirement_feedback');
    assert.equal(parsed.source, 'gate1');
    assert.deepEqual(parsed.impactScope, ['requirement']);
    assert.ok(parsed.rawText.includes('FR-2'));
  });

  it('seeds Agent State + child history triad (no parent stamp)', () => {
    const feedbackText = 'gate1_reject_revise: thiếu NFR security';
    const fields = buildInitialAgentFields({
      phase: 'what',
      runId: 'run-loop1',
      snapshotId: 'snap-1',
      goal: 'Produce SRS proposal',
      constraints: [],
    });
    fields.currentGoal = `Gate1 Loop1 revise: ${feedbackText.slice(0, 400)}`;
    fields.constraints = [
      ...(Array.isArray(fields.constraints) ? fields.constraints : []),
      { type: 'loop1_feedback', text: feedbackText },
    ];
    const history = buildLoop1ChildHistory();
    assert.match(String(fields.currentGoal), /Loop1/);
    assert.equal(fields.constraints[0].type, 'loop1_feedback');
    assert.equal(hasLoop1ChildTriad(history), true);
    assert.deepEqual(history, [
      HISTORY_EVENTS.GATE1_REJECT,
      HISTORY_EVENTS.HUMAN_FEEDBACK,
      HISTORY_EVENTS.GENERATION_CREATED,
    ]);
    // Transition lives on child only — no parent history mutation in this contract
    assert.equal(history.includes('parent:GATE1_REJECT'), false);
  });

  it('string feedback without kind defaults via explicit requirement_feedback wrapper', () => {
    const raw = 'PO reject: scope quá rộng';
    const parsed = parseFeedback({ kind: 'requirement_feedback', text: raw });
    assert.equal(parsed.kind, 'requirement_feedback');
    assert.equal(parsed.source, 'gate1');
    assert.equal(parsed.rawText, raw);
  });
});
