/**
 * Hybrid HITL policy — SoT gates vs in-run; durable checkpointer fail-fast.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  IN_RUN_KINDS,
  isHitlInterruptEnabled,
  normalizeInRunKind,
  isInRunHitlKind,
  awaitInRunHitl,
} = require('../src/orchestration/hitlInterrupt');
const {
  assertDurableCheckpointerForInRunHitl,
} = require('../src/orchestration/hitlCheckpointerPolicy');

describe('hybrid HITL kinds', () => {
  it('exposes only clarify and edit_draft as in-run kinds', () => {
    assert.deepEqual([...IN_RUN_KINDS], ['clarify', 'edit_draft']);
  });

  it('does not treat gate1/gate2 as in-run kinds', () => {
    assert.equal(isInRunHitlKind('gate1'), false);
    assert.equal(isInRunHitlKind('gate2'), false);
    assert.equal(isInRunHitlKind(''), false);
  });

  it('normalizes edit aliases', () => {
    assert.equal(normalizeInRunKind('edit'), 'edit_draft');
    assert.equal(normalizeInRunKind('ask_user'), 'clarify');
  });

  it('awaitInRunHitl skips when interrupt flag off', () => {
    const prev = process.env.AGENT_CORE_HITL_INTERRUPT;
    process.env.AGENT_CORE_HITL_INTERRUPT = '0';
    try {
      assert.equal(isHitlInterruptEnabled(), false);
      const out = awaitInRunHitl({ kind: 'clarify', runId: 'r1' });
      assert.equal(out.skipped, true);
      assert.equal(out.kind, 'clarify');
      assert.equal(out.type, 'in_run_hitl');
    } finally {
      if (prev == null) delete process.env.AGENT_CORE_HITL_INTERRUPT;
      else process.env.AGENT_CORE_HITL_INTERRUPT = prev;
    }
  });
});

describe('durable checkpointer for in-run HITL', () => {
  it('allows memory when interrupt disabled', () => {
    const env = { AGENT_CORE_HITL_INTERRUPT: '0' };
    const out = assertDurableCheckpointerForInRunHitl({ kind: 'memory', env });
    assert.equal(out.ok, true);
    assert.equal(out.skipped, true);
  });

  it('allows redis when interrupt enabled', () => {
    const env = { AGENT_CORE_HITL_INTERRUPT: '1' };
    const out = assertDurableCheckpointerForInRunHitl({ kind: 'redis', env });
    assert.equal(out.ok, true);
  });

  it('fail-fast memory when interrupt enabled', () => {
    const env = { AGENT_CORE_HITL_INTERRUPT: '1' };
    assert.throws(
      () => assertDurableCheckpointerForInRunHitl({ kind: 'memory', env }),
      (err) => err && err.code === 'HITL_CHECKPOINTER_NOT_DURABLE'
    );
  });
});
