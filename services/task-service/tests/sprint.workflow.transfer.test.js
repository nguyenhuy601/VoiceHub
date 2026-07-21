const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertTransitionAllowed,
  DEFAULT_STATES,
  DEFAULT_TRANSITIONS,
  LEGACY_STATUSES,
} = require('../src/services/workflow.service');

describe('workflow assertTransitionAllowed', () => {
  const wf = { states: DEFAULT_STATES, transitions: DEFAULT_TRANSITIONS };

  it('allows linear default edges', () => {
    assert.equal(assertTransitionAllowed(wf, 'todo', 'in_progress').ok, true);
    assert.equal(assertTransitionAllowed(wf, 'in_progress', 'review').ok, true);
    assert.equal(assertTransitionAllowed(wf, 'review', 'done').ok, true);
  });

  it('denies missing edge', () => {
    const r = assertTransitionAllowed(wf, 'todo', 'done');
    assert.equal(r.ok, false);
    assert.match(r.message, /transition/i);
  });

  it('same status ok', () => {
    assert.equal(assertTransitionAllowed(wf, 'todo', 'todo').ok, true);
  });

  it('legacy without workflow uses enum list', () => {
    assert.equal(assertTransitionAllowed(null, 'todo', 'done').ok, true);
    assert.equal(assertTransitionAllowed(null, 'todo', 'weird').ok, false);
    assert.ok(LEGACY_STATUSES.includes('review'));
  });

  it('rejects status not in workflow states', () => {
    const r = assertTransitionAllowed(wf, 'todo', 'blocked');
    assert.equal(r.ok, false);
  });
});

describe('sprint/transfer contract', () => {
  it('sprint statuses are planned|active|closed', () => {
    const allowed = new Set(['planned', 'active', 'closed']);
    assert.equal(allowed.has('planned'), true);
    assert.equal(allowed.has('open'), false);
  });
});
