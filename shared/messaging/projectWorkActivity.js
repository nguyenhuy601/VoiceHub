/**
 * Whitelist + helpers for project.v1.work.activity → #announcement.
 * Pure — no DB / HTTP.
 */

/** Fields that may become announcement messages (significant only). */
const ANNOUNCEMENT_FIELDS = Object.freeze([
  'status',
  'listId',
  'assigneeId',
  'priority',
  'dueDate',
  'sprintId',
  'issue',
]);

const ANNOUNCEMENT_FIELD_SET = new Set(ANNOUNCEMENT_FIELDS);

/**
 * Prefer status over listId when both change in one mutation (one message).
 * @param {Array<{ field: string, from?: unknown, to?: unknown }>} changes
 */
function selectAnnouncementChanges(changes = []) {
  const list = (Array.isArray(changes) ? changes : []).filter(
    (ch) => ch && ANNOUNCEMENT_FIELD_SET.has(String(ch.field || ''))
  );
  const hasStatus = list.some((ch) => String(ch.field) === 'status');
  if (hasStatus) {
    return list.filter((ch) => String(ch.field) !== 'listId');
  }
  return list;
}

function fieldActionLabelVi(field) {
  switch (String(field || '')) {
    case 'status':
    case 'listId':
      return 'đã chuyển trạng thái';
    case 'assigneeId':
      return 'đã đổi người phụ trách';
    case 'priority':
      return 'đã đổi độ ưu tiên';
    case 'dueDate':
      return 'đã đổi hạn';
    case 'sprintId':
      return 'đã đổi sprint';
    case 'issue':
      return 'đã tạo công việc';
    default:
      return 'đã cập nhật';
  }
}

/**
 * Build human content for system announcement message.
 * @param {{ field: string, from?: unknown, to?: unknown, label?: string, actorLabel?: string }} opts
 */
function buildWorkActivityContent(opts = {}) {
  const field = String(opts.field || '');
  const label = String(opts.label || '').trim();
  const actor = String(opts.actorLabel || '').trim() || 'Thành viên';
  const action = fieldActionLabelVi(field);
  const from = opts.from != null && opts.from !== '' ? String(opts.from) : '';
  const to = opts.to != null && opts.to !== '' ? String(opts.to) : '';
  const head = label ? `${actor} ${action} ${label}` : `${actor} ${action}`;
  if (field === 'issue') {
    return to ? `${head}: ${to}` : head;
  }
  if (from || to) {
    return `${head}\n${from || '—'}\n→\n${to || '—'}`;
  }
  return head;
}

module.exports = {
  ANNOUNCEMENT_FIELDS,
  ANNOUNCEMENT_FIELD_SET,
  selectAnnouncementChanges,
  fieldActionLabelVi,
  buildWorkActivityContent,
};
