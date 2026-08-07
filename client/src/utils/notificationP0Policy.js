/**
 * Notify P0 (team chốt) — tránh “notify mọi thứ”.
 * Dùng để lọc UI “Ưu tiên”; không tắt DM message push trong sprint này.
 *
 * P0: System Bot phòng (`system`), task assign/complete, HR/document khi có.
 */

const P0_RAW_TYPES = new Set([
  'system',
  'task_assigned',
  'task_completed',
  'document',
]);

/** UI type đã map trên NotificationsPage */
const P0_UI_TYPES = new Set(['system', 'task', 'document']);

/**
 * @param {{ rawType?: string, type?: string, data?: object }|null|undefined} notif
 */
export function isP0Notification(notif) {
  if (!notif) return false;
  const raw = String(notif.rawType || '').trim().toLowerCase();
  if (raw && P0_RAW_TYPES.has(raw)) return true;
  const ui = String(notif.type || '').trim().toLowerCase();
  if (ui && P0_UI_TYPES.has(ui)) return true;
  const kind = String(notif.data?.kind || '').trim().toLowerCase();
  if (kind.includes('capability') || kind.includes('hr_')) return true;
  return false;
}

export { P0_RAW_TYPES, P0_UI_TYPES };
