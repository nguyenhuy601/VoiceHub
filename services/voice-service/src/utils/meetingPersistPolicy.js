const MIN_RECORDING_SEC = Math.max(
  parseInt(process.env.MIN_VOICE_RECORDING_SEC || '1', 10) || 1,
  1
);

const MIN_PERSIST_SEC = Math.max(
  parseInt(process.env.VOICE_MEETING_MIN_PERSIST_SEC || '60', 10) || 60,
  1
);

function shouldPersistMeeting({ durationSec = 0, hasSegments = false, hasTranscript = false, hasSummary = false } = {}) {
  if (hasSegments || hasTranscript || hasSummary) return true;
  return Number(durationSec) >= MIN_PERSIST_SEC;
}

function segmentMeetsMinDuration(durationSec) {
  return Number(durationSec) >= MIN_RECORDING_SEC;
}

module.exports = {
  MIN_RECORDING_SEC,
  MIN_PERSIST_SEC,
  shouldPersistMeeting,
  segmentMeetsMinDuration,
};
