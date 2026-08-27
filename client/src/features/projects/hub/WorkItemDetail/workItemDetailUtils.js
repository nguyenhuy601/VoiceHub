/** Helpers thuần cho WorkItemDetail (không React). */

export function relId(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object') return String(v._id || v.id || '');
  return String(v);
}

export function isPlanningIssue(issue) {
  return (
    String(issue?.kind || '') === 'planning' ||
    String(issue?.issueType || issue?.type || '').toLowerCase() === 'feature' ||
    String(issue?.issueType || issue?.type || '').toLowerCase() === 'epic'
  );
}

export function namedWorkType(raw) {
  const id = String(raw || '').toLowerCase();
  if (id === 'epic' || id === 'feature' || id === 'story' || id === 'bug' || id === 'subtask') {
    return id;
  }
  if (id === 'task') return 'task';
  return '';
}

export function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function resolveWorkItemDueDate(workItem, { isPlanning } = {}) {
  if (!workItem) return null;
  const planning = isPlanning ?? isPlanningIssue(workItem);
  if (planning) return workItem.targetDate ?? workItem.dueDate ?? null;
  return workItem.dueDate ?? workItem.targetDate ?? null;
}

export function resolveWorkItemStartDate(workItem) {
  return workItem?.startDate ?? null;
}

/**
 * YYYY-MM-DD (từ input type=date) → ISO UTC noon — tránh lệch ngày theo timezone.
 * Chuỗi rỗng / null → null.
 */
export function isoDateFromDateInput(dateValue) {
  if (dateValue == null || dateValue === '') return null;
  const s = String(dateValue).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)).toISOString();
  }
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** ISO / Date → giá trị input type=date (YYYY-MM-DD), ưu tiên prefix chuỗi. */
export function dateInputValueFromIso(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Patch ngày đồng bộ List / Backlog / Overview.
 * Planning: due → targetDate + dueDate; Card: due → dueDate.
 */
export function buildWorkItemDatePatch({ isPlanning = false, startDate, dueDate } = {}) {
  const patch = {};
  if (startDate !== undefined) {
    patch.startDate =
      startDate === '' || startDate == null ? null : isoDateFromDateInput(startDate);
  }
  if (dueDate !== undefined) {
    const due = dueDate === '' || dueDate == null ? null : isoDateFromDateInput(dueDate);
    if (isPlanning) {
      patch.targetDate = due;
      patch.dueDate = due;
    } else {
      patch.dueDate = due;
    }
  }
  return patch;
}

export function hoursInputValue(raw) {
  if (raw == null || raw === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : '';
}

export function unwrapList(res, unwrapPayload) {
  const data = typeof unwrapPayload === 'function' ? unwrapPayload(res) : res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.members)) return data.members;
  return [];
}

/**
 * Map legacy TaskBoardCardDetailModal initialPanel → tab id.
 * attach → attachments; labels|dates|members|detail → overview
 */
export function mapInitialPanelToTab(initialPanel) {
  const p = String(initialPanel || 'detail').toLowerCase();
  if (p === 'attach' || p === 'attachments') return 'attachments';
  if (p === 'activity' || p === 'comments') return 'activity';
  if (p === 'children' || p === 'subtasks') return 'children';
  if (p === 'description') return 'description';
  if (p === 'worklog') return 'worklog';
  if (p === 'approvals') return 'approvals';
  return 'overview';
}

export const HISTORY_FIELD_I18N = {
  status: 'workspace.projectHubWorkFieldStatus',
  parentId: 'workspace.projectHubWorkFieldParent',
  parentTaskId: 'workspace.projectHubWorkFieldParent',
  title: 'workspace.projectHubWorkFieldTitle',
  assigneeId: 'workspace.projectHubWorkFieldAssignee',
  assignments: 'workspace.projectHubWorkFieldAssignee',
  dueDate: 'workspace.projectHubWorkFieldDueDate',
  targetDate: 'workspace.projectHubWorkFieldTargetDate',
  startDate: 'workspace.projectHubWorkFieldStartDate',
  priority: 'workspace.projectHubWorkFieldPriority',
  estimateHours: 'workspace.projectHubWorkFieldEstimate',
  sprintId: 'workspace.projectHubWorkFieldSprint',
  issueType: 'workspace.projectHubWorkFieldIssueType',
  comment: 'workspace.projectHubWorkFieldComment',
  worklog: 'workspace.projectHubWorkFieldWorklog',
  issue: 'workspace.projectHubWorkFieldIssue',
  listId: 'workspace.projectHubWorkFieldList',
  epicId: 'workspace.projectHubWorkFieldEpic',
  tags: 'workspace.projectHubWorkFieldLabels',
  labels: 'workspace.projectHubWorkFieldLabels',
  sortOrder: 'workspace.projectHubWorkFieldRank',
  description: 'workspace.projectHubWorkFieldDescription',
};

/** Status keys → nhãn đọc được (fallback khi không map được list). */
export const HISTORY_STATUS_LABELS = {
  todo: 'To Do',
  to_do: 'To Do',
  backlog: 'Backlog',
  in_progress: 'In Progress',
  inprogress: 'In Progress',
  doing: 'In Progress',
  done: 'Done',
  completed: 'Done',
  blocked: 'Blocked',
  review: 'Review',
};

const OID_HEX_RE = /^[a-f\d]{24}$/i;

export function looksLikeObjectId(value) {
  return OID_HEX_RE.test(String(value || '').trim());
}

function memberDisplayName(members, userId) {
  const id = String(userId || '').trim();
  if (!id) return '';
  const row = (members || []).find((m) => {
    const uid = String(m?.userId || m?.user?._id || m?._id || m?.id || '');
    return uid === id;
  });
  if (!row) return '';
  const nested = row?.user && typeof row.user === 'object' ? row.user : null;
  return String(
    row?.displayName ||
      nested?.displayName ||
      row?.fullName ||
      nested?.fullName ||
      row?.name ||
      nested?.name ||
      ''
  ).trim();
}

function listTitleById(lists, listId) {
  const id = String(listId || '').trim();
  if (!id) return '';
  const arr = Array.isArray(lists) ? lists : Object.values(lists || {});
  const list = arr.find((l) => String(l?._id || l?.id || '') === id);
  return String(list?.title || list?.name || list?.statusKey || '').trim();
}

function listTitleByStatusKey(lists, statusKey) {
  const key = String(statusKey || '').trim();
  if (!key) return '';
  const arr = Array.isArray(lists) ? lists : Object.values(lists || {});
  const list = arr.find(
    (l) => String(l?.statusKey || '').toLowerCase() === key.toLowerCase()
  );
  return String(list?.title || list?.name || '').trim();
}

/**
 * Resolve raw history value → nhãn UI (assignee / list / status).
 * @param {string} field
 * @param {*} value
 * @param {{ members?: array, lists?: array }} [ctx]
 * @returns {string|null} null = trống (hiển thị "None")
 */
export function resolveHistoryValue(field, value, ctx = {}) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) {
    if (!value.length) return null;
    const parts = value
      .map((v) => resolveHistoryValue(field === 'assignments' ? 'assigneeId' : field, v, ctx))
      .filter((s) => s != null && s !== '');
    return parts.length ? parts.join(', ') : null;
  }

  const f = String(field || '');
  const raw = String(value).trim();
  if (!raw) return null;

  if (f === 'assigneeId' || f === 'assignments') {
    const name = memberDisplayName(ctx.members, raw);
    if (name) return name;
    return looksLikeObjectId(raw) ? raw.slice(-6) : raw;
  }
  if (f === 'listId') {
    const title = listTitleById(ctx.lists, raw);
    if (title) return title;
    return looksLikeObjectId(raw) ? raw.slice(-6) : raw;
  }
  if (f === 'status') {
    const fromList = listTitleByStatusKey(ctx.lists, raw);
    if (fromList) return fromList;
    const mapped = HISTORY_STATUS_LABELS[raw.toLowerCase()];
    return mapped || raw;
  }
  if (f === 'epicId' || f === 'parentId' || f === 'parentTaskId' || f === 'sprintId') {
    return looksLikeObjectId(raw) ? raw.slice(-6) : raw;
  }
  return raw;
}

/**
 * Ưu tiên fromLabel/toLabel (BE additive); fallback resolve FE.
 */
export function historySideLabel(row, side, ctx = {}) {
  const pref = side === 'from' ? row?.fromLabel : row?.toLabel;
  if (pref != null && String(pref).trim() !== '') return String(pref).trim();
  const raw = side === 'from' ? row?.from : row?.to;
  return resolveHistoryValue(row?.field, raw, ctx);
}

/**
 * Legacy null→null / không đổi giá trị sau khi resolve → ẩn khỏi History UI.
 */
export function isNoopHistoryRow(row, ctx = {}) {
  const field = String(row?.field || '');
  if (field === 'issue' || field === 'comment' || field === 'worklog') return false;
  const from = historySideLabel(row, 'from', ctx);
  const to = historySideLabel(row, 'to', ctx);
  if ((from == null || from === '') && (to == null || to === '')) return true;
  return String(from) === String(to);
}

export function formatHistoryDisplay(resolved, noneLabel) {
  if (resolved == null || resolved === '') return noneLabel;
  return String(resolved);
}
