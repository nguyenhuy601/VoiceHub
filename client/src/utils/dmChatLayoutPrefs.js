/**
 * Persist layout DM Hội thoại (list trái / info phải) — chỉ FE localStorage.
 * v2 (D4): default RHS đóng; migrate width từ v1 nếu có.
 * rightOpen: không sticky giữa các lần vào trang — luôn bắt đầu đóng (on-demand);
 * mở/đóng trong phiên qua React state; LS chỉ giữ leftOpen + width (rightOpen luôn false).
 */

const STORAGE_KEY = 'vh.dmChat.layout.v2';
const LEGACY_STORAGE_KEY = 'vh.dmChat.layout.v1';

export const DM_LIST_BASE_W = 260;
export const DM_LIST_MIN_W = 200;
export const DM_LIST_MAX_W = 360;

export const DM_INFO_BASE_W = 320;
export const DM_INFO_MIN_W = 200;
export const DM_INFO_MAX_W = 420;

/** rightOpen false = RHS on-demand (không hiện sẵn khi vào Hội thoại). */
const DEFAULTS = Object.freeze({
  leftOpen: true,
  rightOpen: false,
  leftWidth: DM_LIST_BASE_W,
  rightWidth: DM_INFO_BASE_W,
});

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function parseStored(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function widthsFromParsed(parsed) {
  return {
    leftWidth: clamp(parsed?.leftWidth, DM_LIST_MIN_W, DM_LIST_MAX_W),
    rightWidth: clamp(parsed?.rightWidth, DM_INFO_MIN_W, DM_INFO_MAX_W),
  };
}

export function loadDmChatLayoutPrefs() {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      const parsed = parseStored(rawV2);
      if (!parsed) return { ...DEFAULTS };
      const widths = widthsFromParsed(parsed);
      return {
        leftOpen: parsed?.leftOpen !== false,
        // Luôn đóng khi hydrate — tránh “vào trang đã thấy RHS” vì LS từng lưu true.
        rightOpen: false,
        ...widths,
      };
    }

    // Migrate một lần từ v1: giữ width/leftOpen, RHS đóng (D4).
    const legacy = parseStored(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy) {
      const widths = widthsFromParsed(legacy);
      const migrated = {
        leftOpen: legacy?.leftOpen !== false,
        rightOpen: false,
        ...widths,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch {
        /* ignore */
      }
      return migrated;
    }

    return { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDmChatLayoutPrefs(patch = {}) {
  const prev = loadDmChatLayoutPrefs();
  const nextPersisted = {
    leftOpen: patch.leftOpen !== undefined ? Boolean(patch.leftOpen) : prev.leftOpen,
    rightOpen: false,
    leftWidth:
      patch.leftWidth !== undefined
        ? clamp(patch.leftWidth, DM_LIST_MIN_W, DM_LIST_MAX_W)
        : prev.leftWidth,
    rightWidth:
      patch.rightWidth !== undefined
        ? clamp(patch.rightWidth, DM_INFO_MIN_W, DM_INFO_MAX_W)
        : prev.rightWidth,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPersisted));
  } catch {
    /* ignore quota */
  }
  return {
    ...nextPersisted,
    // Caller merge với session state; chỉ đổi khi patch có rightOpen.
    rightOpen:
      patch.rightOpen !== undefined ? Boolean(patch.rightOpen) : nextPersisted.rightOpen,
  };
}

export function getDmChatLayoutDefaults() {
  return { ...DEFAULTS };
}

export function getDmChatLayoutStorageKey() {
  return STORAGE_KEY;
}
