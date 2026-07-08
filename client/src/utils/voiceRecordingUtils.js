export const MIN_VOICE_RECORDING_SEC = 1;

/** Opus voice-only — khớp worker FFmpeg và VOICE_RECORDING_OPUS_BITRATE_KBPS (mặc định 16). */
export const DEFAULT_VOICE_OPUS_BITRATE_KBPS = 16;
export const HIGH_VOICE_OPUS_BITRATE_KBPS = 24;

/**
 * Bitrate Opus cho ghi âm giọng nói (8–48 kbps).
 * Override: VITE_VOICE_RECORDING_OPUS_BITRATE_KBPS trong client/.env (vd. 24).
 */
export function resolveVoiceOpusBitrateKbps() {
  const raw = import.meta.env.VITE_VOICE_RECORDING_OPUS_BITRATE_KBPS;
  const parsed = parseInt(String(raw || ''), 10);
  if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 48) {
    return parsed;
  }
  return DEFAULT_VOICE_OPUS_BITRATE_KBPS;
}

/** MediaRecorder options — Opus 16 kbps ≈ 0.5–1 MB / 5 phút (chỉ audio). */
export function buildVoiceRecorderOptions(mimeType) {
  const type = String(mimeType || '').trim();
  const opts = { mimeType: type };
  if (type.startsWith('audio/')) {
    opts.audioBitsPerSecond = resolveVoiceOpusBitrateKbps() * 1000;
  }
  return opts;
}

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
