/**
 * Persist layout Không gian công ty (site trái/phải) — chỉ FE localStorage.
 */

const STORAGE_KEY = 'vh.orgWorkspace.layout.v1';

export const ORG_LEFT_RAIL_BASE_W = 260;
export const ORG_LEFT_RAIL_MIN_W = 200;
export const ORG_LEFT_RAIL_MAX_W = 360;
export const ORG_LEFT_RAIL_ICON_W = 56;

export const ORG_RIGHT_PANEL_BASE_W = 280;
export const ORG_RIGHT_PANEL_MIN_W = 200;
export const ORG_RIGHT_PANEL_MAX_W = 460;

const DEFAULTS = Object.freeze({
  leftOpen: true,
  rightOpen: true,
  leftWidth: ORG_LEFT_RAIL_BASE_W,
  rightWidth: ORG_RIGHT_PANEL_BASE_W,
});

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function loadOrgWorkspaceLayoutPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      leftOpen: parsed?.leftOpen !== false,
      rightOpen: parsed?.rightOpen !== false,
      leftWidth: clamp(parsed?.leftWidth, ORG_LEFT_RAIL_MIN_W, ORG_LEFT_RAIL_MAX_W),
      rightWidth: clamp(parsed?.rightWidth, ORG_RIGHT_PANEL_MIN_W, ORG_RIGHT_PANEL_MAX_W),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveOrgWorkspaceLayoutPrefs(patch = {}) {
  const prev = loadOrgWorkspaceLayoutPrefs();
  const next = {
    leftOpen: patch.leftOpen !== undefined ? Boolean(patch.leftOpen) : prev.leftOpen,
    rightOpen: patch.rightOpen !== undefined ? Boolean(patch.rightOpen) : prev.rightOpen,
    leftWidth:
      patch.leftWidth !== undefined
        ? clamp(patch.leftWidth, ORG_LEFT_RAIL_MIN_W, ORG_LEFT_RAIL_MAX_W)
        : prev.leftWidth,
    rightWidth:
      patch.rightWidth !== undefined
        ? clamp(patch.rightWidth, ORG_RIGHT_PANEL_MIN_W, ORG_RIGHT_PANEL_MAX_W)
        : prev.rightWidth,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function isWideContentTab(tab) {
  const id = String(tab || '').trim().toLowerCase();
  return id === 'documents' || id === 'calendar' || id === 'meetings';
}

/** Rail kênh hội thoại company (`/app/company/chat`) — tách prefs để RHS mặc định đóng. */
const CHAT_RAIL_STORAGE_KEY = 'vh.orgWorkspace.chatRail.v1';

export const CHAT_RAIL_BASE_W = 252;
export const CHAT_RAIL_MIN_W = 200;
export const CHAT_RAIL_MAX_W = 360;

const CHAT_RAIL_DEFAULTS = Object.freeze({
  leftOpen: true,
  rightOpen: false,
  leftWidth: CHAT_RAIL_BASE_W,
});

export function loadCompanyChatRailPrefs() {
  try {
    const raw = localStorage.getItem(CHAT_RAIL_STORAGE_KEY);
    if (!raw) return { ...CHAT_RAIL_DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      leftOpen: parsed?.leftOpen !== false,
      rightOpen: parsed?.rightOpen === true,
      leftWidth: clamp(parsed?.leftWidth, CHAT_RAIL_MIN_W, CHAT_RAIL_MAX_W),
    };
  } catch {
    return { ...CHAT_RAIL_DEFAULTS };
  }
}

export function saveCompanyChatRailPrefs(patch = {}) {
  const prev = loadCompanyChatRailPrefs();
  const next = {
    leftOpen: patch.leftOpen !== undefined ? Boolean(patch.leftOpen) : prev.leftOpen,
    rightOpen: patch.rightOpen !== undefined ? Boolean(patch.rightOpen) : prev.rightOpen,
    leftWidth:
      patch.leftWidth !== undefined
        ? clamp(patch.leftWidth, CHAT_RAIL_MIN_W, CHAT_RAIL_MAX_W)
        : prev.leftWidth,
  };
  try {
    localStorage.setItem(CHAT_RAIL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}
