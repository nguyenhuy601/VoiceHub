/** Helpers cho Project Hub (Collaborate Tasks). */

export const PROJECT_HUB_TABS = [
  { id: 'overview', labelKey: 'workspace.projectHubTabOverview' },
  { id: 'list', labelKey: 'workspace.projectHubTabList' },
  { id: 'planning', labelKey: 'workspace.projectHubTabPlanning' },
  { id: 'board', labelKey: 'workspace.projectHubTabBoard' },
  { id: 'changeRequests', labelKey: 'workspace.projectHubTabChangeRequests' },
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

export function unwrapChangeRequestList(res) {
  const data = res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: 1, size: data.length || 20 };
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    items,
    total: Number(data?.total) || 0,
    page: Math.max(1, Number(data?.page) || 1),
    size: Math.max(1, Number(data?.size) || 20),
  };
}

export function unwrapChangeRequestEntity(res) {
  const data = res?.data?.data ?? res?.data ?? res;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

export function unwrapProjectMembers(res) {
  const data = res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.members)) return data.members;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export function extractHubUserId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    return String(value._id || value.id || value.userId || '');
  }
  return '';
}

function nestedUser(member) {
  return member?.user && typeof member.user === 'object' ? member.user : null;
}

export function memberUserId(member) {
  const nested = nestedUser(member);
  return extractHubUserId(
    member?.userId || member?.id || nested?._id || nested?.id || member?._id
  );
}

export function memberDisplayName(member) {
  if (!member) return '';
  const nested = nestedUser(member);
  return String(
    member.displayName ||
      nested?.displayName ||
      member.fullName ||
      nested?.fullName ||
      member.name ||
      nested?.name ||
      member.username ||
      nested?.username ||
      ''
  ).trim();
}

export function memberAvatar(member) {
  if (!member) return '';
  const nested = nestedUser(member);
  return member.avatar || member.avatarUrl || nested?.avatar || nested?.avatarUrl || '';
}

export function findMemberByUserId(members, userId) {
  const id = extractHubUserId(userId);
  if (!id) return null;
  return (members || []).find((m) => memberUserId(m) === id) || null;
}

/** Tên reporter / createdBy: field API, rồi members, rồi 6 ký tự cuối id. */
export function resolveHubActor(raw, members = []) {
  const nameFromDto = String(
    raw?.reporterName ||
      raw?.createdByName ||
      raw?.creatorName ||
      (typeof raw?.createdBy === 'object' ? raw.createdBy?.displayName || raw.createdBy?.name : '') ||
      ''
  ).trim();
  const userId =
    extractHubUserId(raw?.reporterId) ||
    extractHubUserId(raw?.createdById) ||
    extractHubUserId(raw?.createdBy);
  const avatarFromDto =
    raw?.reporterAvatar ||
    raw?.createdByAvatar ||
    (typeof raw?.createdBy === 'object' ? raw.createdBy?.avatar : '') ||
    '';
  const member = findMemberByUserId(members, userId);
  const name = nameFromDto || memberDisplayName(member) || (userId ? userId.slice(-6) : '');
  const avatar = avatarFromDto || memberAvatar(member) || '';
  if (!name && !userId) return null;
  return { userId, name, avatar };
}

export function isLinkableCrWorkType(issueType) {
  const it = String(issueType || 'task').toLowerCase();
  return it === 'feature' || it === 'story' || it === 'task' || it === 'bug';
}

export function collectCrWorkItems(row, boardCards = []) {
  const cardById = new Map();
  for (const c of boardCards || []) {
    const id = String(c?._id || c?.id || '');
    if (id) cardById.set(id, c);
  }
  const dtoById = new Map();
  for (const w of Array.isArray(row?.workItems) ? row.workItems : []) {
    const id = String(w?._id || w?.id || '');
    if (id && w) dtoById.set(id, w);
  }
  const ordered = [];
  const seen = new Set();
  const pushId = (rawId) => {
    const id = String(rawId || '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };
  for (const w of Array.isArray(row?.workItems) ? row.workItems : []) {
    pushId(w?._id || w?.id);
  }
  for (const id of Array.isArray(row?.workItemIds) ? row.workItemIds : []) {
    pushId(id);
  }
  return ordered.map((id) => cardById.get(id) || dtoById.get(id) || { _id: id, title: '' });
}

/** Merge PATCH CR: DTO mỏng không được xóa work; link/unlink cập nhật chip từ board cards. */
export function mergeChangeRequestPatch(prev, saved, patch = {}, workCards = []) {
  const prior = prev && typeof prev === 'object' ? prev : {};
  const incoming = saved && typeof saved === 'object' ? saved : {};
  const next = { ...prior, ...incoming };
  const idsFromSaved = Array.isArray(incoming.workItemIds) ? incoming.workItemIds : null;
  const itemsFromSaved = Array.isArray(incoming.workItems) ? incoming.workItems : null;
  let workItemIds = (idsFromSaved != null ? idsFromSaved : prior.workItemIds || [])
    .map((id) => String(id || ''))
    .filter(Boolean);
  let workItems = itemsFromSaved != null ? itemsFromSaved : prior.workItems || [];

  const linkId = patch.linkWorkItemId ? String(patch.linkWorkItemId) : '';
  const unlinkId = patch.unlinkWorkItemId ? String(patch.unlinkWorkItemId) : '';
  if (linkId && !workItemIds.includes(linkId)) {
    workItemIds = [...workItemIds, linkId];
  }
  if (unlinkId) {
    workItemIds = workItemIds.filter((id) => id !== unlinkId);
    workItems = (Array.isArray(workItems) ? workItems : []).filter(
      (w) => String(w?._id || w?.id || '') !== unlinkId
    );
  }
  next.workItemIds = workItemIds;
  next.workItems = workItems;
  next.workItems = collectCrWorkItems(next, workCards);
  return next;
}

export const HUB_GRID_CELL_BORDER = 'border-r border-border';

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

/** Class pill status (board card + drawer children) — token, không hardcode màu. */
export function statusBucketPillClass(bucket) {
  if (bucket === 'done') return 'border-transparent bg-success text-primary-foreground';
  if (bucket === 'progress') return 'border-transparent bg-primary text-primary-foreground';
  return 'border-border bg-muted text-muted-foreground';
}

export function childWorkProgressPct(done, total) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  const d = Number(done) || 0;
  return Math.min(100, Math.round((d / t) * 100));
}

/** Thanh tiến độ con: full Done → success, còn lại primary. */
export function childWorkProgressBarClass({ done = 0, total = 0 } = {}) {
  const t = Number(total) || 0;
  const d = Number(done) || 0;
  if (t > 0 && d >= t) return 'bg-success';
  return 'bg-primary';
}

function normalizeListTitleKey(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const LEGACY_VI_STATUS_TITLES = new Set(['chua lam', 'dang lam', 'cho duyet', 'xong']);

const STATUS_SELECT_TITLE_BUCKETS = [
  { bucket: 'todo', titles: ['todo', 'to do', 'chua lam'] },
  { bucket: 'doing', titles: ['doing', 'in progress', 'dang lam'] },
  { bucket: 'review', titles: ['review', 'in review', 'cho duyet'] },
  { bucket: 'done', titles: ['done', 'xong', 'complete', 'completed'] },
  { bucket: 'cancelled', titles: ['cancelled', 'canceled', 'huy'] },
];

export function isLegacyViStatusListTitle(title) {
  return LEGACY_VI_STATUS_TITLES.has(normalizeListTitleKey(title));
}

/** Bucket để gộp cột EN/VI trùng nghĩa trên dropdown status. */
export function statusSelectBucket(list) {
  const key = String(list?.statusKey || '').trim().toLowerCase();
  if (key === 'todo' || key === 'open') return 'todo';
  if (key === 'doing' || key === 'in_progress' || key === 'dev') return 'doing';
  if (key === 'review' || key === 'code_review' || key === 'in_review') return 'review';
  if (key === 'done' || key === 'completed') return 'done';
  if (key === 'cancelled' || key === 'canceled') return 'cancelled';
  const n = normalizeListTitleKey(list?.title);
  for (const row of STATUS_SELECT_TITLE_BUCKETS) {
    if (row.titles.includes(n)) return row.bucket;
  }
  return key || `id:${list?._id || list?.id || n || 'list'}`;
}

function asStatusSelectLists(lists) {
  if (Array.isArray(lists)) return lists;
  if (lists && typeof lists === 'object') return Object.values(lists);
  return [];
}

function hasListStatusKey(list) {
  return Boolean(String(list?.statusKey || '').trim());
}

/**
 * Dropdown đổi status: ưu tiên cột map workflow (`statusKey`).
 * Board chưa sync: một list / bucket (ẩn Chưa làm/… khi đã có Todo/…).
 * Luôn giữ list hiện tại của thẻ.
 */
export function listsForStatusSelect(lists = [], currentListId = '') {
  const arr = asStatusSelectLists(lists);
  const current = String(currentListId || '');
  const hasWorkflowKey = arr.some(hasListStatusKey);
  const source = hasWorkflowKey ? arr.filter(hasListStatusKey) : arr;
  const byBucket = new Map();

  const score = (list) => {
    let s = 0;
    if (hasListStatusKey(list)) s += 2;
    if (!isLegacyViStatusListTitle(list?.title)) s += 4;
    s -= (Number(list?.order) || 0) / 1e6;
    return s;
  };

  for (const list of source) {
    if (!list) continue;
    const bucket = statusSelectBucket(list);
    const prev = byBucket.get(bucket);
    if (!prev || score(list) > score(prev)) byBucket.set(bucket, list);
  }

  if (current) {
    const cur = arr.find((l) => String(l?._id || l?.id || '') === current);
    if (cur) byBucket.set(statusSelectBucket(cur), cur);
  }

  return [...byBucket.values()].sort(
    (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)
  );
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
 * Timeline dự án (ngày calendar): cả hai có giá trị và start > end.
 * Thiếu một trong hai → không invalid (cho phép chỉ start hoặc chỉ end).
 */
export function isProjectDateRangeInvalid(startYmd, endYmd) {
  const start = String(startYmd || '').trim().slice(0, 10);
  const end = String(endYmd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  return start > end;
}

/**
 * Thành viên được gán trên một work item (assigneeId + assignments + assignees).
 * @returns {Set<string>}
 */
export function collectIssueMemberIds(issue) {
  const out = new Set();
  const primary = String(issue?.assigneeId || '').trim();
  if (primary) out.add(primary);
  for (const row of issue?.assignments || []) {
    const uid = String(row?.userId || '').trim();
    if (uid) out.add(uid);
  }
  for (const row of issue?.assignees || []) {
    const uid = String(row?.id || row?.userId || '').trim();
    if (uid) out.add(uid);
  }
  return out;
}

/**
 * @param {Iterable<{ sprintId?: unknown, assigneeId?: unknown, assignments?: unknown[], assignees?: unknown[] }>} issues
 * @returns {Map<string, Set<string>>}
 */
export function buildSprintMemberIdsBySprintId(issues = []) {
  const map = new Map();
  for (const issue of issues || []) {
    const sid = String(issue?.sprintId || '').trim();
    if (!sid) continue;
    if (!map.has(sid)) map.set(sid, new Set());
    const bucket = map.get(sid);
    for (const uid of collectIssueMemberIds(issue)) bucket.add(uid);
  }
  return map;
}

function memberSetForSprint(memberIdsBySprintId, sprintId) {
  const sid = String(sprintId || '').trim();
  if (!sid || !memberIdsBySprintId) return new Set();
  if (memberIdsBySprintId instanceof Map) {
    return memberIdsBySprintId.get(sid) || new Set();
  }
  const raw = memberIdsBySprintId[sid];
  if (!raw) return new Set();
  return raw instanceof Set ? raw : new Set(raw);
}

function setsIntersect(a, b) {
  for (const id of a) {
    if (b.has(id)) return true;
  }
  return false;
}

/**
 * @returns {{ ok: true } | { ok: false, errorKey: string }}
 */
export function assertCanStartSprint({
  sprint,
  sprints = [],
  issueCount = 0,
  canManage = false,
  memberIdsBySprintId = null,
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
  const candidateMembers = memberSetForSprint(memberIdsBySprintId, sid);
  const otherActive = (Array.isArray(sprints) ? sprints : []).filter((row) => {
    const id = String(row?._id || row?.id || '');
    return id && id !== sid && String(row?.status || '').toLowerCase() === 'active';
  });
  for (const row of otherActive) {
    const activeId = String(row?._id || row?.id || '');
    const activeMembers = memberSetForSprint(memberIdsBySprintId, activeId);
    if (setsIntersect(candidateMembers, activeMembers)) {
      return { ok: false, errorKey: 'workspace.projectHubSprintStartMemberOverlap' };
    }
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

function sortSprintsNewestFirst(rows) {
  return [...rows].sort((a, b) => {
    const tb = new Date(b?.createdAt || 0).getTime();
    const ta = new Date(a?.createdAt || 0).getTime();
    return tb - ta;
  });
}

/**
 * Sprint active gắn với viewer (có work được gán). Nhiều → newest.
 * Không có → fallback resolveActiveSprint (toolbar Complete sprint).
 */
export function resolveViewerActiveSprint({ sprints = [], cards = [], userId = '' } = {}) {
  const uid = String(userId || '').trim();
  const active = (Array.isArray(sprints) ? sprints : []).filter(
    (s) => String(s?.status || '').toLowerCase() === 'active'
  );
  if (!active.length) return null;
  if (!uid) return resolveActiveSprint(active);

  const memberBySprint = buildSprintMemberIdsBySprintId(cards);
  const mine = active.filter((s) => {
    const sid = String(s?._id || s?.id || '').trim();
    return sid && memberBySprint.get(sid)?.has(uid);
  });
  if (mine.length) return sortSprintsNewestFirst(mine)[0];
  return resolveActiveSprint(active);
}

export function isCardInSprint(card, sprintId) {
  const sid = String(sprintId || '').trim();
  if (!sid) return false;
  return String(card?.sprintId || '').trim() === sid;
}
