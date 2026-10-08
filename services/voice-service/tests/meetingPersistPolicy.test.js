const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldPersistMeeting,
  MIN_PERSIST_SEC,
  MIN_RECORDING_SEC,
} = require('../src/utils/meetingPersistPolicy');

describe('meeting persist policy', () => {
  it('persists short meeting when transcript exists', () => {
    assert.equal(
      shouldPersistMeeting({ durationSec: 30, hasTranscript: true }),
      true
    );
  });

  it('persists when segments exist even if short', () => {
    assert.equal(shouldPersistMeeting({ durationSec: 10, hasSegments: true }), true);
  });

  it('discards empty short meeting', () => {
    assert.equal(shouldPersistMeeting({ durationSec: MIN_PERSIST_SEC - 1 }), false);
  });

  it('persists by duration threshold', () => {
    assert.equal(shouldPersistMeeting({ durationSec: MIN_PERSIST_SEC }), true);
  });

  it('exports recording min sec', () => {
    assert.ok(MIN_RECORDING_SEC >= 1);
  });
});
