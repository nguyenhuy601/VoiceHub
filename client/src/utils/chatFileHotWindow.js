/**
 * Hot window UI cho danh sách tệp chat — khác TTL storage (FILE_RETENTION_*).
 * 0 = hiện tất cả (rollback). Mặc định 90 ngày (team chốt).
 */

export const DEFAULT_FILE_HOT_DISPLAY_DAYS = 90;

/**
 * @param {unknown} [envRaw] — test inject; production dùng VITE_FILE_HOT_DISPLAY_DAYS
 * @returns {number}
 */
export function getFileHotDisplayDays(envRaw) {
  const raw =
    envRaw !== undefined
      ? envRaw
      : typeof import.meta !== 'undefined' && import.meta.env
        ? import.meta.env.VITE_FILE_HOT_DISPLAY_DAYS
        : undefined;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_FILE_HOT_DISPLAY_DAYS;
  }
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_FILE_HOT_DISPLAY_DAYS;
  return n;
}

/**
 * @param {{ at?: string|Date, createdAt?: string|Date }|null|undefined} item
 * @param {{ now?: Date|number, hotDays?: number }} [opts]
 */
export function isHotChatFile(item, opts = {}) {
  const hotDays = opts.hotDays !== undefined ? opts.hotDays : getFileHotDisplayDays();
  if (hotDays === 0) return true;
  const raw = item?.at ?? item?.createdAt;
  if (!raw) return true;
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return true;
  const nowMs = opts.now != null ? new Date(opts.now).getTime() : Date.now();
  const windowMs = hotDays * 24 * 60 * 60 * 1000;
  return ts >= nowMs - windowMs;
}

/**
 * @template T
 * @param {T[]} files
 * @param {{ now?: Date|number, hotDays?: number }} [opts]
 * @returns {{ hot: T[], archivedCount: number }}
 */
export function partitionHotChatFiles(files, opts = {}) {
  const list = Array.isArray(files) ? files : [];
  const hot = [];
  let archivedCount = 0;
  for (const f of list) {
    if (isHotChatFile(f, opts)) hot.push(f);
    else archivedCount += 1;
  }
  return { hot, archivedCount };
}
