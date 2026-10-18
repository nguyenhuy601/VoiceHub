import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESENCE_PHASE,
  initialPresenceState,
  presenceReducer,
} from './presenceState.js';

describe('presenceState', () => {
  it('opens to mounted enter', () => {
    const next = presenceReducer(initialPresenceState(false), { type: 'OPEN' });
    assert.deepEqual(next, { mounted: true, phase: PRESENCE_PHASE.ENTER });
  });

  it('closes to exit then unmounts', () => {
    const open = presenceReducer(initialPresenceState(false), { type: 'OPEN' });
    const closing = presenceReducer(open, { type: 'CLOSE' });
    assert.deepEqual(closing, { mounted: true, phase: PRESENCE_PHASE.EXIT });
    const done = presenceReducer(closing, { type: 'EXIT_DONE' });
    assert.deepEqual(done, { mounted: false, phase: null });
  });

  it('initialPresenceState mirrors isOpen', () => {
    assert.deepEqual(initialPresenceState(true), {
      mounted: true,
      phase: PRESENCE_PHASE.ENTER,
    });
    assert.deepEqual(initialPresenceState(false), {
      mounted: false,
      phase: null,
    });
  });
});
