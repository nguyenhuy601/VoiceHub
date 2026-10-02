/**
 * Unit contract for phase-run idempotency key resolution (no DB).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function resolveClientIdempotencyKey({ header, bodyKey } = {}) {
  return String(header || bodyKey || '')
    .trim()
    .slice(0, 256);
}

function shouldReplayPhaseRun({ force, clientKey, existing }) {
  if (force) return false;
  if (
    clientKey &&
    String(existing?.clientIdempotencyKey || '') === clientKey &&
    String(existing?.remoteRunId || '')
  ) {
    return true;
  }
  if (existing?.status === 'pending' && String(existing.remoteRunId || '')) {
    return true;
  }
  return false;
}

describe('phase-run idempotency helpers', () => {
  it('reads key from header', () => {
    assert.equal(
      resolveClientIdempotencyKey({ header: '  abc-123  ', bodyKey: 'other' }),
      'abc-123'
    );
  });

  it('replays same client key', () => {
    assert.equal(
      shouldReplayPhaseRun({
        force: false,
        clientKey: 'k1',
        existing: { clientIdempotencyKey: 'k1', remoteRunId: 'r1', status: 'ready' },
      }),
      true
    );
  });

  it('replays pending without matching key', () => {
    assert.equal(
      shouldReplayPhaseRun({
        force: false,
        clientKey: '',
        existing: { status: 'pending', remoteRunId: 'r2' },
      }),
      true
    );
  });

  it('force skips replay', () => {
    assert.equal(
      shouldReplayPhaseRun({
        force: true,
        clientKey: 'k1',
        existing: { clientIdempotencyKey: 'k1', remoteRunId: 'r1', status: 'pending' },
      }),
      false
    );
  });
});
