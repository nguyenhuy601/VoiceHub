/**
 * Notify P0 (team chốt) — tránh “notify mọi thứ”.
 * Sau B0, type `system` có data.kind đa dạng: không coi mọi system là P0.
 *
 * P0: gán/hoàn thành thẻ, hạn, HITL duyệt (project_approval + ai_proposal_pending),
 * thêm vào dự án, sprint sắp hết, document, @mention kênh dự án, capability/HR,
 * và system cũ không có kind.
 *
 * === H1 SoT — cố ý KHÔNG P0 / không Inbox ===
 * - Chat tin thường kênh → socket only (không producer Inbox)
 * - task_board_list (đổi list / watcher) → có thể có system+kind nhưng không P0
 * - change_request_work → system+kind, không P0 (tránh spam)
 * - Overview / Files / Members chỉ xem → không notify
 * - Receipts đã gửi/đã xem kênh → không phải notify (PR R1 riêng)
 */

const P0_RAW_TYPES = new Set(['task_assigned', 'task_completed', 'document']);

/** UI type đã map trên Inbox */
const P0_UI_TYPES = new Set(['task', 'document', 'deadline', 'mention']);

const P0_SYSTEM_KINDS = new Set([
  'ai_proposal_pending',
  'task_due_soon',
  'task_overdue',
  'project_member_added',
  'project_approval',
  'sprint_ending_soon',
]);

/** Kind system đã gửi nhưng cố ý không đưa vào chip Ưu tiên */
const NON_P0_SYSTEM_KINDS = new Set(['task_board_list', 'change_request_work']);

const P0_MESSAGE_KINDS = new Set(['project_mention']);

const DEADLINE_KINDS = new Set(['task_due_soon', 'task_overdue']);

/**
 * @param {string} [rawType]
 * @param {string} [kind]
 */
export function mapNotificationUiType(rawType, kind) {
  const raw = String(rawType || 'system');
  const k = String(kind || '').trim().toLowerCase();
  if (raw === 'friend_request' || raw === 'friend_accepted') return 'friend';
  if (raw === 'task_assigned' || raw === 'task_completed') return 'task';
  if (DEADLINE_KINDS.has(k)) return 'deadline';
  if (raw === 'document') return 'file';
  if (raw === 'message') {
    if (k === 'project_mention' || k === 'cross_team_work') return 'mention';
    return 'message';
  }
  if (raw === 'meeting') return 'meeting';
  if (raw === 'org_join_application') return 'system';
  if (k === 'ai_proposal_pending') return 'system';
  return raw;
}

function notificationKind(notif) {
  return String(notif?.data?.kind || '').trim().toLowerCase();
}

/**
 * @param {{ rawType?: string, type?: string, data?: object }|null|undefined} notif
 */
export function isP0Notification(notif) {
  if (!notif) return false;
  const raw = String(notif.rawType || '').trim().toLowerCase();
  const kind = notificationKind(notif);
  if (NON_P0_SYSTEM_KINDS.has(kind)) return false;
  if (raw === 'message') {
    return P0_MESSAGE_KINDS.has(kind);
  }
  if (raw && P0_RAW_TYPES.has(raw)) return true;
  const ui = String(notif.type || '').trim().toLowerCase();
  if (ui === 'mention' && P0_MESSAGE_KINDS.has(kind)) return true;
  if (ui && P0_UI_TYPES.has(ui) && ui !== 'mention') return true;
  if (kind.includes('capability') || kind.startsWith('hr_')) return true;
  if (raw === 'system' || ui === 'system') {
    if (!kind) return true;
    return P0_SYSTEM_KINDS.has(kind);
  }
  return false;
}

export {
  P0_RAW_TYPES,
  P0_UI_TYPES,
  P0_SYSTEM_KINDS,
  P0_MESSAGE_KINDS,
  NON_P0_SYSTEM_KINDS,
};
