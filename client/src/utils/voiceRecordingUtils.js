export const MIN_VOICE_RECORDING_SEC = 180;

export function pickVoiceRecorderMime(hasVideo = false) {
  const candidates = hasVideo
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/webm;codecs=opus', 'audio/webm'];
  return (
    candidates.find((type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) ||
    ''
  );
}

export function buildMergedRecordingStream(localStream, remoteStreams = []) {
  const out = new MediaStream();
  const add = (stream) => {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      if (track.readyState === 'live' && track.kind === 'audio') out.addTrack(track);
    }
  };
  add(localStream);
  if (remoteStreams instanceof Map) {
    for (const stream of remoteStreams.values()) add(stream);
  } else if (Array.isArray(remoteStreams)) {
    for (const stream of remoteStreams) add(stream);
  }
  return out;
}

export function formatMeetingDuration(totalSec) {
  const sec = Math.max(0, Number(totalSec) || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
