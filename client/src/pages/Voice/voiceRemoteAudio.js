export function clampVolumePct(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 100;
}

export async function applyRemoteAudioElement(el, { speakerOff, speakerVolume, speakerDeviceId }) {
  if (!el) return;
  el.muted = Boolean(speakerOff);
  el.volume = clampVolumePct(speakerVolume) / 100;
  const sinkId = String(speakerDeviceId || '').trim();
  if (sinkId && typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype) {
    try {
      await el.setSinkId(sinkId);
    } catch {
      /* fallback default output */
    }
  }
}

export async function bindAndPlayRemoteAudio(el, stream, outputOpts) {
  if (!el || !stream) return;
  await applyRemoteAudioElement(el, outputOpts);
  if (el.srcObject !== stream) {
    el.srcObject = stream;
  }
  try {
    await el.play();
  } catch (err) {
    console.warn('[voice] remote audio play failed', err?.message || err);
  }
}
