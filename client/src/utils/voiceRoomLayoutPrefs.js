/**
 * Persist layout panel phụ Phòng họp (chat/people) — chỉ FE localStorage.
 */

const STORAGE_KEY = 'vh.voiceRoom.layout.v1';

export const VOICE_SIDE_BASE_W = 280;
export const VOICE_SIDE_MIN_W = 240;
export const VOICE_SIDE_MAX_W = 360;

const PANEL_MODES = new Set(['chat', 'people']);

const DEFAULTS = Object.freeze({
  sidePanelWidth: VOICE_SIDE_BASE_W,
  lastPanel: null,
});

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function normalizeLastPanel(raw) {
  const id = String(raw || '').trim();
  return PANEL_MODES.has(id) ? id : null;
}

export function loadVoiceRoomLayoutPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      sidePanelWidth: clamp(parsed?.sidePanelWidth, VOICE_SIDE_MIN_W, VOICE_SIDE_MAX_W),
      lastPanel: normalizeLastPanel(parsed?.lastPanel),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveVoiceRoomLayoutPrefs(patch = {}) {
  const prev = loadVoiceRoomLayoutPrefs();
  const next = {
    sidePanelWidth:
      patch.sidePanelWidth !== undefined
        ? clamp(patch.sidePanelWidth, VOICE_SIDE_MIN_W, VOICE_SIDE_MAX_W)
        : prev.sidePanelWidth,
    lastPanel:
      patch.lastPanel !== undefined ? normalizeLastPanel(patch.lastPanel) : prev.lastPanel,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function getVoiceRoomLayoutDefaults() {
  return { ...DEFAULTS };
}
