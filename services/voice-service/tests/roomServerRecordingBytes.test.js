const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Mirror of segmentHasUsableBytes / minRecordingBytes without loading mediasoup.
 * Keep in sync with roomServerRecording.service.js
 */
function minRecordingBytes(envVal) {
  if (envVal === undefined || envVal === '') return 2048;
  return Math.max(0, parseInt(envVal, 10) || 0);
}

function segmentHasUsableBytes(size, envMin) {
  const n = Number(size) || 0;
  if (n <= 0) return false;
  return n >= minRecordingBytes(envMin);
}

describe('segmentHasUsableBytes', () => {
  it('rejects zero and negative regardless of MIN_BYTES=0', () => {
    assert.equal(segmentHasUsableBytes(0, '0'), false);
    assert.equal(segmentHasUsableBytes(-1, '0'), false);
  });

  it('accepts any positive size when MIN_BYTES=0', () => {
    assert.equal(segmentHasUsableBytes(1, '0'), true);
    assert.equal(segmentHasUsableBytes(512, '0'), true);
  });

  it('defaults to 2048 when env unset', () => {
    assert.equal(minRecordingBytes(undefined), 2048);
    assert.equal(minRecordingBytes(''), 2048);
    assert.equal(segmentHasUsableBytes(551, undefined), false);
    assert.equal(segmentHasUsableBytes(2048, undefined), true);
  });

  it('respects MIN_BYTES threshold when set', () => {
    assert.equal(segmentHasUsableBytes(500, '1024'), false);
    assert.equal(segmentHasUsableBytes(1024, '1024'), true);
    assert.equal(segmentHasUsableBytes(0, '1024'), false);
  });
});
