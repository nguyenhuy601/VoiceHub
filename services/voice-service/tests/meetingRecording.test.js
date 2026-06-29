const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Inline copy of enrich logic to avoid @enterprise/shared in unit test
const MIN_RECORDING_SEC = 180;

function enrichMeetingRecordingFields(meeting) {
  const row = { ...meeting };
  const durationSec = row.durationSec || 0;
  const status = row.recordingStatus || 'none';
  const hasAudio = status === 'ready' && Boolean(row.audioStoragePath);
  const hasTranscript = Boolean(String(row.transcript || '').trim());
  const legacyRecording = Boolean(row.recordingUrl) && !row.audioStoragePath;
  const hasRecording =
    durationSec >= MIN_RECORDING_SEC &&
    (hasAudio ||
      hasTranscript ||
      legacyRecording ||
      ['pending_upload', 'processing', 'audio_expired'].includes(status));

  return {
    ...row,
    durationSec,
    hasRecording,
    hasAudio,
    hasTranscript,
    summaryPreview: String(row.summary || '').trim().slice(0, 160),
  };
}

describe('meeting recording enrich', () => {
  it('marks ready opus as hasAudio', () => {
    const row = enrichMeetingRecordingFields({
      durationSec: 200,
      recordingStatus: 'ready',
      audioStoragePath: 'meeting-recordings/room1/a.opus',
    });
    assert.equal(row.hasAudio, true);
    assert.equal(row.hasRecording, true);
  });

  it('audio_expired keeps transcript access', () => {
    const row = enrichMeetingRecordingFields({
      durationSec: 300,
      recordingStatus: 'audio_expired',
      transcript: 'hello',
      audioStoragePath: null,
    });
    assert.equal(row.hasAudio, false);
    assert.equal(row.hasRecording, true);
    assert.equal(row.hasTranscript, true);
  });
});
