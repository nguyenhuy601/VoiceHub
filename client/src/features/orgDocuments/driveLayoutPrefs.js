/**
 * Persist layout kho tài liệu (rail facet + preview) — tách chatRail.v1.
 */

const STORAGE_KEY = 'vh.orgWorkspace.driveRail.v1';

export const DRIVE_RAIL_BASE_W = 252;
export const DRIVE_RAIL_MIN_W = 200;
export const DRIVE_RAIL_MAX_W = 360;

export const DRIVE_PREVIEW_BASE_W = 320;
export const DRIVE_PREVIEW_MIN_W = 240;
export const DRIVE_PREVIEW_MAX_W = 480;

export const DRIVE_VIEW_LIST = 'list';
export const DRIVE_VIEW_GRID = 'grid';

const DEFAULTS = Object.freeze({
  leftOpen: true,
  previewOpen: true,
  leftWidth: DRIVE_RAIL_BASE_W,
  previewWidth: DRIVE_PREVIEW_BASE_W,
  viewMode: DRIVE_VIEW_LIST,
});

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function normalizeViewMode(value) {
  return value === DRIVE_VIEW_GRID ? DRIVE_VIEW_GRID : DRIVE_VIEW_LIST;
}

export function loadDriveRailPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      leftOpen: parsed?.leftOpen !== false,
      previewOpen: parsed?.previewOpen !== false,
      leftWidth: clamp(parsed?.leftWidth, DRIVE_RAIL_MIN_W, DRIVE_RAIL_MAX_W),
      previewWidth: clamp(parsed?.previewWidth, DRIVE_PREVIEW_MIN_W, DRIVE_PREVIEW_MAX_W),
      viewMode: normalizeViewMode(parsed?.viewMode),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDriveRailPrefs(patch = {}) {
  const prev = loadDriveRailPrefs();
  const next = {
    leftOpen: patch.leftOpen !== undefined ? Boolean(patch.leftOpen) : prev.leftOpen,
    previewOpen: patch.previewOpen !== undefined ? Boolean(patch.previewOpen) : prev.previewOpen,
    leftWidth:
      patch.leftWidth !== undefined
        ? clamp(patch.leftWidth, DRIVE_RAIL_MIN_W, DRIVE_RAIL_MAX_W)
        : prev.leftWidth,
    previewWidth:
      patch.previewWidth !== undefined
        ? clamp(patch.previewWidth, DRIVE_PREVIEW_MIN_W, DRIVE_PREVIEW_MAX_W)
        : prev.previewWidth,
    viewMode:
      patch.viewMode !== undefined ? normalizeViewMode(patch.viewMode) : prev.viewMode,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}
