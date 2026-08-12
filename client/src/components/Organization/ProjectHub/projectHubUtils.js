/** Helpers cho Project Hub (Collaborate Tasks). */

export const PROJECT_HUB_TABS = [
  { id: 'overview', labelKey: 'workspace.projectHubTabOverview' },
  { id: 'list', labelKey: 'workspace.projectHubTabList' },
  { id: 'planning', labelKey: 'workspace.projectHubTabPlanning' },
  { id: 'board', labelKey: 'workspace.projectHubTabBoard' },
  { id: 'members', labelKey: 'workspace.projectHubTabMembers' },
  { id: 'files', labelKey: 'workspace.projectHubTabFiles' },
  { id: 'activity', labelKey: 'workspace.projectHubTabActivity' },
  { id: 'settings', labelKey: 'workspace.projectHubTabSettings' },
];

export function projectInitials(title = '') {
  const parts = String(title || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'PR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || 'PR';
}

export function countCardsByIssueType(cards = []) {
  const out = { story: 0, task: 0, bug: 0, other: 0 };
  for (const card of cards || []) {
    const it = String(card.issueType || card.type || 'task').toLowerCase();
    if (it === 'story') out.story += 1;
    else if (it === 'bug') out.bug += 1;
    else if (it === 'task') out.task += 1;
    else out.other += 1;
  }
  return out;
}

export function computeHubBoardSummary(cards = [], lists = []) {
  const listById = new Map((lists || []).map((l) => [String(l._id), l]));
  const total = (cards || []).length;
  let done = 0;
  let overdue = 0;
  let inReview = 0;
  const now = Date.now();
  for (const card of cards || []) {
    const list = listById.get(String(card.listId || card.list || ''));
    const status = String(card.status || list?.statusKey || list?.title || '').toLowerCase();
    if (status.includes('done') || status.includes('complete') || status === 'done') done += 1;
    if (status.includes('review')) inReview += 1;
    const due = card.dueDate ? new Date(card.dueDate).getTime() : NaN;
    if (Number.isFinite(due) && due < now && !(status.includes('done') || status.includes('complete'))) {
      overdue += 1;
    }
  }
  const donePercent = total ? Math.round((done / total) * 100) : 0;
  return { total, done, donePercent, overdue, inReview };
}

export function collectCardAttachments(cards = []) {
  const out = [];
  for (const card of cards || []) {
    const cardId = String(card._id || card.id || '');
    const title = String(card.title || '');
    for (const a of card.attachments || []) {
      out.push({
        id: `${cardId}-${a.url || a.name || out.length}`,
        name: a.name || a.originalName || title || 'file',
        url: a.url || '',
        cardId,
        cardTitle: title,
        updatedAt: a.uploadedAt || card.updatedAt || card.createdAt,
      });
    }
  }
  return out.sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  );
}

export function collectCardActivity(cards = [], limit = 20) {
  const events = (cards || []).map((card) => ({
    id: String(card._id || card.id),
    title: String(card.title || ''),
    status: String(card.status || ''),
    assigneeName: card.assigneeName || '',
    at: card.updatedAt || card.createdAt,
    kind: 'card',
  }));
  return events
    .filter((e) => e.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

export function formatHubDate(value, locale = 'vi') {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function toDateInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function unwrapPlanningList(res) {
  const data = res?.data?.data ?? res?.data ?? res;
  return Array.isArray(data) ? data : [];
}

export function unwrapPlanningEntity(res) {
  const data = res?.data?.data ?? res?.data ?? res;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

/** Feature hiển thị như Story. */
export function normalizeIssueType(type) {
  const key = String(type || 'task').toLowerCase();
  if (key === 'feature' || key === 'story') return 'story';
  if (key === 'bug') return 'bug';
  if (key === 'epic') return 'epic';
  return 'task';
}

/** Nhãn hiển thị — không phải sequential key hệ thống. */
export function displayIssueKey(projectCode, id) {
  const code =
    String(projectCode || 'VH')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase() || 'VH';
  const suffix = String(id || '').replace(/[^a-fA-F0-9]/g, '').slice(-4).toUpperCase() || '0000';
  return `${code}-${suffix}`;
}

export function buildIssueOverlay(items = []) {
  const map = {};
  for (const item of items || []) {
    const id = String(item?._id || item?.id || '');
    if (!id) continue;
    map[id] = {
      issueType: item.issueType || item.type,
      epicId: item.epicId ?? null,
      estimateHours: item.estimateHours,
    };
  }
  return map;
}

export function mergeIssueWithOverlay(card, overlay = {}) {
  const id = String(card?._id || card?.id || '');
  const extra = overlay[id] || {};
  const epicFromCard = card?.epicId;
  return {
    ...card,
    issueType: card?.issueType || card?.type || extra.issueType || 'task',
    epicId: epicFromCard !== undefined && epicFromCard !== null && epicFromCard !== '' ? epicFromCard : extra.epicId,
    estimateHours: card?.estimateHours ?? extra.estimateHours,
  };
}

export function classifyListStatusBucket(listOrStatus) {
  const s = String(
    typeof listOrStatus === 'string'
      ? listOrStatus
      : listOrStatus?.statusKey || listOrStatus?.title || ''
  ).toLowerCase();
  if (s.includes('done') || s.includes('complete')) return 'done';
  if (s.includes('progress') || s.includes('doing') || s.includes('review')) return 'progress';
  return 'todo';
}

export function countIssuesByStatusBucket(issues = [], lists = []) {
  const listById = new Map((lists || []).map((l) => [String(l._id), l]));
  const out = { todo: 0, progress: 0, done: 0 };
  for (const issue of issues || []) {
    const list = listById.get(String(issue.listId || issue.list || ''));
    const bucket = classifyListStatusBucket(issue.status || list);
    out[bucket] += 1;
  }
  return out;
}

export function dueDateTone(dueDate, statusOrList) {
  if (!dueDate) return 'none';
  const due = new Date(dueDate).getTime();
  if (!Number.isFinite(due)) return 'none';
  const bucket = classifyListStatusBucket(statusOrList);
  if (bucket === 'done') return 'none';
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (due < now) return 'overdue';
  if (due - now <= 2 * dayMs) return 'soon';
  return 'none';
}

export function formatHubDateShort(value, locale = 'vi') {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Created / Updated — Aug 07, 2026, 9:27 AM */
export function formatHubDateTime(value, locale = 'en') {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale === 'vi' ? 'en-US' : 'en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Due date — Aug 8, 2026 */
export function formatHubDueDate(value, locale = 'en') {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function toDateTimeLocalValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDaysToDateTimeLocal(startValue, days) {
  const d = startValue ? new Date(startValue) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + Number(days || 0));
  return toDateTimeLocalValue(d);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SPRINT_DAYS = 14;

/** Parse ISO / Date; invalid → null. */
export function parseHubDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Ngày sprint khi Start: giữ cặp hợp lệ; thiếu thì now/+14d.
 * Cả hai parse được nhưng start >= end → { error: 'datesInvalid' } (không swap).
 */
export function defaultSprintDateRange(sprint = {}, now = Date.now()) {
  const start = parseHubDate(sprint?.startDate);
  const end = parseHubDate(sprint?.endDate);
  if (start && end) {
    if (start.getTime() >= end.getTime()) return { error: 'datesInvalid' };
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  const base = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  if (start && !end) {
    const nextEnd = new Date(start.getTime() + DEFAULT_SPRINT_DAYS * DAY_MS);
    return { startDate: start.toISOString(), endDate: nextEnd.toISOString() };
  }
  if (!start && end) {
    const nextStart = new Date(end.getTime() - DEFAULT_SPRINT_DAYS * DAY_MS);
    if (nextStart.getTime() >= end.getTime()) return { error: 'datesInvalid' };
    return { startDate: nextStart.toISOString(), endDate: end.toISOString() };
  }
  const s = new Date(base);
  const e = new Date(base + DEFAULT_SPRINT_DAYS * DAY_MS);
  return { startDate: s.toISOString(), endDate: e.toISOString() };
}

/** Cả hai ngày filled và start >= end. Cặp thiếu không tính invalid. */
export function isSprintDateRangeInvalid(startValue, endValue) {
  const start = parseHubDate(startValue);
  const end = parseHubDate(endValue);
  if (!start || !end) return false;
  return start.getTime() >= end.getTime();
}

/**
 * @returns {{ ok: true } | { ok: false, errorKey: string }}
 */
export function assertCanStartSprint({
  sprint,
  sprints = [],
  issueCount = 0,
  canManage = false,
} = {}) {
  if (!canManage) {
    return { ok: false, errorKey: 'workspace.projectHubSprintStartNoPermission' };
  }
  const sid = String(sprint?._id || sprint?.id || '').trim();
  if (!sid) return { ok: false, errorKey: 'workspace.projectHubPlanSprintFail' };
  if (!String(sprint?.name || '').trim()) {
    return { ok: false, errorKey: 'workspace.projectHubPlanSprintFail' };
  }
  const status = String(sprint?.status || 'planned').toLowerCase();
  if (status !== 'planned') return { ok: false, errorKey: 'workspace.projectHubPlanSprintFail' };
  if (!Number.isFinite(Number(issueCount)) || Number(issueCount) <= 0) {
    return { ok: false, errorKey: 'workspace.projectHubPlanSprintIssuesEmpty' };
  }
  const otherActive = (Array.isArray(sprints) ? sprints : []).some((row) => {
    const id = String(row?._id || row?.id || '');
    return id && id !== sid && String(row?.status || '').toLowerCase() === 'active';
  });
  if (otherActive) {
    return { ok: false, errorKey: 'workspace.projectHubSprintStartOtherActive' };
  }
  return { ok: true };
}

/** Sprint active; nếu nhiều thì createdAt mới nhất. */
export function resolveActiveSprint(sprints = []) {
  const active = (Array.isArray(sprints) ? sprints : []).filter(
    (s) => String(s?.status || '').toLowerCase() === 'active'
  );
  if (!active.length) return null;
  if (active.length === 1) return active[0];
  return [...active].sort((a, b) => {
    const tb = new Date(b?.createdAt || 0).getTime();
    const ta = new Date(a?.createdAt || 0).getTime();
    return tb - ta;
  })[0];
}

export function isCardInSprint(card, sprintId) {
  const sid = String(sprintId || '').trim();
  if (!sid) return false;
  return String(card?.sprintId || '').trim() === sid;
}
