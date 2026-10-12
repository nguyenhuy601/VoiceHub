import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PRESENCE_PHASE,
  initialPresenceState,
  presenceReducer,
} from './presenceState.js';
import { resolveMotionDuration } from './tokens.js';

describe('presenceReducer', () => {
  it('OPEN mounts with enter phase', () => {
    const next = presenceReducer({ mounted: false, phase: null }, { type: 'OPEN' });
    assert.deepEqual(next, { mounted: true, phase: PRESENCE_PHASE.ENTER });
  });

  it('CLOSE while mounted switches to exit', () => {
    const next = presenceReducer(
      { mounted: true, phase: PRESENCE_PHASE.ENTER },
      { type: 'CLOSE' }
    );
    assert.deepEqual(next, { mounted: true, phase: PRESENCE_PHASE.EXIT });
  });

  it('CLOSE while unmounted is a no-op', () => {
    const prev = { mounted: false, phase: null };
    assert.equal(presenceReducer(prev, { type: 'CLOSE' }), prev);
  });

  it('EXIT_DONE after exit unmounts', () => {
    const next = presenceReducer(
      { mounted: true, phase: PRESENCE_PHASE.EXIT },
      { type: 'EXIT_DONE' }
    );
    assert.deepEqual(next, { mounted: false, phase: null });
  });

  it('EXIT_DONE ignored when not exiting', () => {
    const prev = { mounted: true, phase: PRESENCE_PHASE.ENTER };
    assert.equal(presenceReducer(prev, { type: 'EXIT_DONE' }), prev);
  });

  it('OPEN during exit remounts enter', () => {
    const next = presenceReducer(
      { mounted: true, phase: PRESENCE_PHASE.EXIT },
      { type: 'OPEN' }
    );
    assert.deepEqual(next, { mounted: true, phase: PRESENCE_PHASE.ENTER });
  });
});

describe('initialPresenceState', () => {
  it('open starts mounted', () => {
    assert.deepEqual(initialPresenceState(true), {
      mounted: true,
      phase: PRESENCE_PHASE.ENTER,
    });
  });

  it('closed starts unmounted', () => {
    assert.deepEqual(initialPresenceState(false), {
      mounted: false,
      phase: null,
    });
  });
});

describe('resolveMotionDuration', () => {
  it('returns duration when motion allowed', () => {
    assert.equal(resolveMotionDuration(220, false), 220);
  });

  it('returns 0 when reduced motion', () => {
    assert.equal(resolveMotionDuration(220, true), 0);
  });

  it('returns 0 for invalid duration', () => {
    assert.equal(resolveMotionDuration(NaN, false), 0);
    assert.equal(resolveMotionDuration(-1, false), 0);
  });
});
