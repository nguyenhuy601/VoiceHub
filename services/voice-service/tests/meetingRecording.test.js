const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MIN_RECORDING_SEC = 180;

function enrichMeetingRecordingFields(meeting, segments = []) {
  const row = { ...meeting };
  const durationSec = row.durationSec || 0;
  const status = row.recordingStatus || 'none';
  const segmentHasAudio = segments.some((s) => s.hasAudio || s.status === 'ready');
  const hasAudio =
    segmentHasAudio || (status === 'ready' && Boolean(row.audioStoragePath));
  const hasTranscript = Boolean(String(row.transcript || '').trim());
  const hasSummary =
    Boolean(String(row.summary || '').trim()) || row.summaryStatus === 'ready';
  const hasRecording =
    segments.length > 0 ||
    hasAudio ||
    hasTranscript ||
    hasSummary ||
    ['pending_upload', 'processing', 'audio_expired'].includes(status);

  return {
    ...row,
    durationSec,
    hasRecording,
    hasAudio,
    hasTranscript,
    hasSummary,
    segments,
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

  it('summary only without audio', () => {
    const row = enrichMeetingRecordingFields({
      durationSec: 90,
      recordingStatus: 'none',
      transcript: 'notes',
      summary: 'short summary',
      audioStoragePath: null,
    });
    assert.equal(row.hasAudio, false);
    assert.equal(row.hasRecording, true);
    assert.equal(row.hasSummary, true);
  });

  it('multi-segment marks hasRecording', () => {
    const row = enrichMeetingRecordingFields(
      { durationSec: 200, recordingStatus: 'processing' },
      [{ segmentIndex: 0, status: 'ready', hasAudio: true }]
    );
    assert.equal(row.hasRecording, true);
    assert.equal(row.segments.length, 1);
  });
});
