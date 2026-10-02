const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  HISTORY_EVENTS,
  appendHistoryEvent,
  buildLoop1ChildHistory,
  buildLoop2ReplanHistory,
  hasLoop1ChildTriad,
} = require('../src/contracts/loopStateContract');

describe('loopStateContract', () => {
  it('buildLoop1ChildHistory seeds GATE1_REJECT HUMAN_FEEDBACK GENERATION_CREATED', () => {
    const h = buildLoop1ChildHistory();
    assert.deepEqual(h, [
      HISTORY_EVENTS.GATE1_REJECT,
      HISTORY_EVENTS.HUMAN_FEEDBACK,
      HISTORY_EVENTS.GENERATION_CREATED,
    ]);
    assert.equal(hasLoop1ChildTriad(h), true);
  });

  it('appendHistoryEvent is append-only and skips duplicate last', () => {
    let h = appendHistoryEvent([], 'A');
    h = appendHistoryEvent(h, 'A');
    assert.deepEqual(h, ['A']);
    h = appendHistoryEvent(h, 'B');
    assert.deepEqual(h, ['A', 'B']);
  });

  it('buildLoop2ReplanHistory appends HUMAN_FEEDBACK then REPLAN_REQUESTED', () => {
    const h = buildLoop2ReplanHistory(['execute:EffortTool']);
    assert.ok(h.includes(HISTORY_EVENTS.HUMAN_FEEDBACK));
    assert.ok(h.includes(HISTORY_EVENTS.REPLAN_REQUESTED));
    assert.equal(h[h.length - 1], HISTORY_EVENTS.REPLAN_REQUESTED);
  });
});
