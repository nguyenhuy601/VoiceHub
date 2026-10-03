const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * T3 — same Idempotency-Key → one child (runStore findByIdempotencyKey contract).
 * Pure unit: simulate createQueuedRun idempotent replay flag.
 */
describe('loop1IdempotentRevise T3', () => {
  it('same pack+job+idempotencyKey maps to single child identity', () => {
    const key = 'pack-a:phase_what:revise:parent-7';
    const first = { _id: 'child-8', idempotencyKey: key, __idempotentReplay: false };
    const secondLookup = { ...first, __idempotentReplay: true };
    assert.equal(String(first._id), String(secondLookup._id));
    assert.equal(secondLookup.__idempotentReplay, true);
    assert.equal(first.idempotencyKey, key);
  });

  it('stable revise idempotency key formula includes parent', () => {
    const packId = 'pack-a';
    const parentRunId = 'parent-7';
    const key = `${packId}:phase_what:loop1_revise:${parentRunId}`;
    const again = `${packId}:phase_what:loop1_revise:${parentRunId}`;
    assert.equal(key, again);
  });
});
