/** Helpers cho Project Hub (Collaborate Tasks). */

import { HISTORY_FIELD_I18N } from './WorkItemDetail/workItemDetailUtils.js';
import { normalizePriorityConfig, slugPriorityKey } from './projectPriorityConfig.js';

export const PROJECT_HUB_TABS = [
  { id: 'overview', labelKey: 'workspace.projectHubTabOverview' },
  { id: 'list', labelKey: 'workspace.projectHubTabList' },
  { id: 'planning', labelKey: 'workspace.projectHubTabPlanning' },
  { id: 'board', labelKey: 'workspace.projectHubTabBoard' },
  { id: 'chat', labelKey: 'workspace.projectHubTabChat' },
  { id: 'timeline', labelKey: 'workspace.projectHubTabTimeline' },
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

/** Đếm epic / feature trên planning backlog (Overview). */
export function countPlanningByType(planningItems = []) {
  let epic = 0;
  let feature = 0;
  for (const item of planningItems || []) {
    const type = String(item?.type || '').toLowerCase();
    if (type === 'epic') epic += 1;
    else if (type === 'feature') feature += 1;
  }
  return { epic, feature };
}

/** Số thẻ board gắn sprintId. */
export function countCardsInSprint(cards = [], sprintId) {
  const sid = String(sprintId || '').trim();
  if (!sid) return 0;
  return (cards || []).filter((c) => String(c?.sprintId || '').trim() === sid).length;
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

function hubCardStatusText(card, listById) {
  const list = listById.get(String(card?.listId || card?.list || ''));
  return String(card?.status || list?.statusKey || list?.title || '').toLowerCase();
}

function isHubCardDoneStatus(status) {
  const s = String(status || '').toLowerCase();
  return s.includes('done') || s.includes('complete') || s === 'done';
}

/**
 * Hạng mục mở quá hạn / đang duyệt — tooltip KPI & banner Attention.
 * @param {'overdue'|'inReview'} kind
 * @returns {{ id: string, title: string }[]}
 */
export function listHubHealthCards(cards = [], lists = [], kind = 'overdue', { limit = 12 } = {}) {
  const listById = hubListById(lists);
  const now = Date.now();
  const want = String(kind || '').toLowerCase();
  const out = [];
  for (const card of cards || []) {
    const status = hubCardStatusText(card, listById);
    if (want === 'overdue') {
      if (isHubCardDoneStatus(status)) continue;
      const due = card?.dueDate ? new Date(card.dueDate).getTime() : NaN;
      if (!(Number.isFinite(due) && due < now)) continue;
    } else if (want === 'inreview' || want === 'in_review') {
      if (!status.includes('review')) continue;
    } else {
      continue;
    }
    out.push({
      id: String(card._id || card.id || ''),
      title: String(card.title || '').trim() || '—',
    });
  }
  out.sort((a, b) => a.title.localeCompare(b.title));
  const cap = Math.max(1, Number(limit) || 12);
  return out.slice(0, cap);
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

function hubListById(lists = []) {
  return new Map((lists || []).map((l) => [String(l._id), l]));
}

export function isHubCardOpen(card, listById) {
  const list = listById.get(String(card?.listId || card?.list || ''));
  const status = String(card?.status || list?.statusKey || list?.title || '').toLowerCase();
  return !(status.includes('done') || status.includes('complete') || status === 'done');
}

/** Số thẻ đang mở chưa có assignee (Overview KPI optional). */
export function countUnassignedOpenCards(cards = [], lists = []) {
  const listById = hubListById(lists);
  return (cards || []).filter(
    (card) =>
      isHubCardOpen(card, listById) &&
      !String(card.assigneeId || '').trim() &&
      !String(card.assigneeName || '').trim()
  ).length;
}

/** Tổng estimateHours trên thẻ đang mở (Overview KPI optional). */
export function sumOpenCardEstimateHours(cards = [], lists = []) {
  const listById = hubListById(lists);
  return (cards || []).reduce((sum, card) => {
    if (!isHubCardOpen(card, listById)) return sum;
    const h = Number(card.estimateHours);
    if (!Number.isFinite(h) || h <= 0) return sum;
    return sum + h;
  }, 0);
}

/** i18n nhãn status project (planning, ready_for_planning, …). */
export function formatHubProjectStatus(status, t) {
  const raw = String(status || '').trim();
  if (!raw) return '';
  const norm = raw.toLowerCase().replace(/[\s-]+/g, '_');
  const key = `workspace.projectHubProjectStatus_${norm}`;
  const label = t(key);
  return label === key ? raw : label;
}

/** i18n methodology (kanban / scrum / waterfall). */
export function formatHubMethodology(methodology, t) {
  const raw = String(methodology || '').trim();
  if (!raw) return '';
  const key = `workspace.projectHubMethodology_${raw.toLowerCase()}`;
  const label = t(key);
  return label === key ? raw : label;
}

/**
 * Tín hiệu Attention cho Overview (không health score tổng hợp).
 * overdue >= 1 → attention; ngược lại on_track.
 */
export function hubAttentionState({ overdue } = {}) {
  const n = Number(overdue);
  if (!Number.isFinite(n) || n < 0) return 'on_track';
  return n >= 1 ? 'attention' : 'on_track';
}

/**
 * Ranking Action Center: Overdue → Due soon → In Review → Unassigned → other.
 */
export function hubActionAttentionRank({ dueTone, isInReview, hasAssignee } = {}) {
  if (dueTone === 'overdue') return 0;
  if (dueTone === 'soon') return 1;
  if (isInReview) return 2;
  if (!hasAssignee) return 3;
  return 4;
}

function hubCardAssigneeName(card) {
  const named = String(card?.assigneeName || '').trim();
  if (named) return named;
  const first = Array.isArray(card?.assignees) ? card.assignees[0] : null;
  return String(first?.displayName || first?.name || first?.username || '').trim();
}

function hubCardHasAssignee(card) {
  return Boolean(String(card?.assigneeId || '').trim() || hubCardAssigneeName(card));
}

function hubCardIsInReview(card, list) {
  const status = String(card?.status || list?.statusKey || list?.title || '').toLowerCase();
  return status.includes('review');
}

/**
 * Việc cần chú ý trên Overview: thẻ chưa done, ranking Action Center.
 */
export function pickNextHubActions(cards = [], lists = [], { limit = 5, projectCode = '' } = {}) {
  const listById = hubListById(lists);
  const ranked = (cards || [])
    .filter((card) => isHubCardOpen(card, listById))
    .map((card) => {
      const list = listById.get(String(card?.listId || card?.list || ''));
      const dueRaw = card.dueDate || card.targetDate || null;
      const dueTs = dueRaw ? new Date(dueRaw).getTime() : NaN;
      const hasDue = Number.isFinite(dueTs);
      const dueTone = dueDateTone(dueRaw, card.status || list);
      const isInReview = hubCardIsInReview(card, list);
      const hasAssignee = hubCardHasAssignee(card);
      return {
        card,
        list,
        dueRaw,
        dueTs: hasDue ? dueTs : Number.POSITIVE_INFINITY,
        dueTone,
        attentionRank: hubActionAttentionRank({ dueTone, isInReview, hasAssignee }),
      };
    });

  ranked.sort((a, b) => {
    if (a.attentionRank !== b.attentionRank) return a.attentionRank - b.attentionRank;
    if (a.dueTs !== b.dueTs) return a.dueTs - b.dueTs;
    return String(a.card.title || '').localeCompare(String(b.card.title || ''));
  });

  return ranked.slice(0, limit).map(({ card, list, dueRaw, dueTone, attentionRank }) => {
    const id = String(card._id || card.id);
    return {
      id,
      title: String(card.title || ''),
      issueKey: displayIssueKey(projectCode, id),
      issueType: card.issueType || card.type || 'task',
      statusLabel: String(list?.title || card.status || list?.statusKey || '').trim(),
      statusKey: String(card.status || list?.statusKey || '').trim(),
      assigneeName: hubCardAssigneeName(card),
      dueDate: dueRaw,
      dueTone,
      attentionRank,
    };
  });
}

function hubActivityPayload(raw) {
  return raw?.payload && typeof raw.payload === 'object' ? raw.payload : {};
}

/** Chuẩn hoá TaskActivityLog (BE) → field/from/to giống workHistoryDiff.mapLogRow. */
export function normalizeHubActivityRow(raw) {
  const type = String(raw?.type || '');
  const payload = hubActivityPayload(raw);
  const workTitle = String(raw?.title || payload.title || '').trim();
  const base = {
    id: String(raw?._id || raw?.id || ''),
    at: raw?.createdAt || raw?.at || null,
    workTitle,
    type,
    field: '',
    from: null,
    to: null,
  };

  if (type === 'work.field_changed') {
    return {
      ...base,
      field: String(payload.field || ''),
      from: payload.from === undefined ? null : payload.from,
      to: payload.to === undefined ? null : payload.to,
    };
  }
  if (type === 'estimate_updated') {
    return {
      ...base,
      field: 'estimateHours',
      from: payload.before === undefined ? null : payload.before,
      to: payload.after === undefined ? null : payload.after,
    };
  }
  if (type === 'task.created' || type === 'task.subtask_created') {
    return { ...base, field: 'issue', from: null, to: workTitle || null };
  }
  if (type === 'worklog_added') {
    return {
      ...base,
      field: 'worklog',
      from: null,
      to: payload.hours != null ? payload.hours : workTitle || null,
    };
  }
  if (type === 'task.updated') {
    const fields = Array.isArray(payload.fields) ? payload.fields : [];
    if (fields.length === 1) {
      return { ...base, field: String(fields[0]), from: null, to: null };
    }
    if (fields.length > 1) {
      return { ...base, field: fields.map(String).join(','), from: null, to: null };
    }
    return { ...base, field: 'issue', from: null, to: null };
  }
  return { ...base, field: type || 'issue', from: null, to: null };
}

function hubActivityFieldLabel(field, t) {
  const key = String(field || '').trim();
  if (!key) return t('workspace.projectHubWorkFieldIssue');
  if (key.includes(',')) {
    return key
      .split(',')
      .map((part) => hubActivityFieldLabel(part.trim(), t))
      .filter(Boolean)
      .join(', ');
  }
  const i18nKey = HISTORY_FIELD_I18N[key];
  return i18nKey ? t(i18nKey) : key;
}

function formatHubActivityValue(value, t, locale = 'vi') {
  if (value === null || value === undefined || value === '') {
    return t('workspace.projectHubWorkNone');
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : t('workspace.projectHubWorkNone');
  }
  if (typeof value === 'object') {
    const nested = value?.title || value?.name || value?.label;
    if (nested) return String(nested);
    if (value._id || value.id) return String(value._id || value.id);
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return formatHubDate(text, locale);
  }
  return text;
}

/** Một dòng mô tả activity (i18n), không trả raw type/field key. */
export function formatHubActivityLine(row, t, { locale = 'vi' } = {}) {
  const norm =
    row && Object.prototype.hasOwnProperty.call(row, 'field') && !row?.payload
      ? row
      : normalizeHubActivityRow(row);
  const field = String(norm.field || '');
  const fieldLabel = hubActivityFieldLabel(field, t);

  if (field === 'issue') {
    return t('workspace.projectHubActivityCreated');
  }
  if (field.includes(',')) {
    return t('workspace.projectHubActivityUpdatedMultiple', { fields: fieldLabel });
  }

  const verbKey =
    field === 'parentId' || field === 'parentTaskId' || field === 'epicId'
      ? 'workspace.projectHubActivityChanged'
      : 'workspace.projectHubActivityUpdated';

  let line = t(verbKey, { field: fieldLabel });

  if (
    field !== 'comment' &&
    field !== 'issue' &&
    ((norm.from !== null && norm.from !== undefined && norm.from !== '') ||
      (norm.to !== null && norm.to !== undefined && norm.to !== ''))
  ) {
    const from = formatHubActivityValue(norm.from, t, locale);
    const to = formatHubActivityValue(norm.to, t, locale);
    line = `${line}: ${from} → ${to}`;
  }

  return line;
}

/** Map activity API / fallback card → item hiển thị Overview & Activity tab. */
export function mapHubActivityItem(raw, t, { locale = 'vi', members = [] } = {}) {
  if (raw?.kind === 'card') {
    return {
      id: raw.id,
      at: raw.at,
      title: raw.title,
      detail: t('workspace.projectHubActivityCardUpdated'),
      assigneeName: raw.assigneeName || '',
      actorName: '',
    };
  }

  const norm = normalizeHubActivityRow(raw);
  const actor = resolveHubActor(
    {
      createdBy: raw?.actorId,
      createdByName: raw?.actorName,
      reporterName: raw?.actorName,
    },
    members
  );
  return {
    id: norm.id || `${norm.type}-${norm.at}`,
    at: norm.at,
    title: norm.workTitle || t('workspace.projectHubActivityUntitledWork'),
    detail: formatHubActivityLine(norm, t, { locale }),
    assigneeName: '',
    actorName: actor?.name || '',
  };
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

/**
 * Màu bar Timeline theo status bucket; overdue ưu tiên destructive.
 * Token design system — không hex.
 */
export function timelineBarToneClass({ bucket, dueTone } = {}) {
  if (dueTone === 'overdue') return 'bg-destructive';
  if (bucket === 'done') return 'bg-success';
  if (bucket === 'progress') return 'bg-primary';
  return 'bg-primary/40 ring-1 ring-inset ring-primary/25';
}

export function timelineBarForegroundClass({ bucket, dueTone } = {}) {
  if (dueTone === 'overdue' || bucket === 'done' || bucket === 'progress') {
    return 'text-primary-foreground';
  }
  return 'text-foreground';
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

const OVERVIEW_STATUS_SEGMENTS = [
  {
    key: 'todo',
    labelKey: 'workspace.projectHubBacklogStatusTodo',
    /* Xám rõ trên dark/light — không primary (trùng In Progress). */
    barClass: 'bg-muted-foreground',
    fillClass: 'fill-muted-foreground',
  },
  {
    key: 'progress',
    labelKey: 'workspace.projectHubBacklogStatusProgress',
    barClass: 'bg-primary',
    fillClass: 'fill-primary',
  },
  {
    key: 'done',
    labelKey: 'workspace.projectHubBacklogStatusDone',
    barClass: 'bg-success',
    fillClass: 'fill-success',
  },
];

const OVERVIEW_TYPE_SEGMENTS = [
  {
    key: 'story',
    labelKey: 'workspace.projectHubStatStories',
    barClass: 'bg-primary',
  },
  {
    key: 'task',
    labelKey: 'workspace.projectHubStatTasks',
    barClass: 'bg-muted-foreground/45',
  },
  {
    key: 'bug',
    labelKey: 'workspace.projectHubStatBugs',
    barClass: 'bg-destructive',
  },
];

const OVERVIEW_PRIORITY_BAR_CLASS = {
  urgent: 'bg-destructive',
  high: 'bg-warning',
  medium: 'bg-primary',
  low: 'bg-muted-foreground/35',
  none: 'bg-muted-foreground/25',
};

const OVERVIEW_PRIORITY_FILL_CLASS = {
  urgent: 'fill-destructive',
  high: 'fill-warning',
  medium: 'fill-primary',
  low: 'fill-muted-foreground/40',
  none: 'fill-muted-foreground/30',
};

const OVERVIEW_PRIORITY_LABEL_KEY = {
  urgent: 'workspace.projectHubPriorityUrgent',
  high: 'workspace.projectHubPriorityHigh',
  medium: 'workspace.projectHubPriorityMedium',
  low: 'workspace.projectHubPriorityLow',
  none: 'workspace.projectHubOverviewPriorityNone',
};

function overviewPct(count, total) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.round(((Number(count) || 0) / t) * 100);
}

function overviewPolar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Path annulus (donut slice) — góc 0 = đỉnh, chiều kim đồng hồ. */
export function overviewDonutAnnulusPath(cx, cy, outerR, innerR, startAngle, sweep) {
  const s = Number(sweep) || 0;
  if (s <= 0.001) return '';
  if (s >= 359.999) {
    const [ot, oy] = overviewPolar(cx, cy, outerR, 0);
    const [obx, oby] = overviewPolar(cx, cy, outerR, 180);
    const [it, iy] = overviewPolar(cx, cy, innerR, 0);
    const [ibx, iby] = overviewPolar(cx, cy, innerR, 180);
    return [
      `M ${ot} ${oy}`,
      `A ${outerR} ${outerR} 0 1 1 ${obx} ${oby}`,
      `A ${outerR} ${outerR} 0 1 1 ${ot} ${oy}`,
      `M ${it} ${iy}`,
      `A ${innerR} ${innerR} 0 1 0 ${ibx} ${iby}`,
      `A ${innerR} ${innerR} 0 1 0 ${it} ${iy}`,
      'Z',
    ].join(' ');
  }
  const end = Number(startAngle) + s;
  const [ox1, oy1] = overviewPolar(cx, cy, outerR, startAngle);
  const [ox2, oy2] = overviewPolar(cx, cy, outerR, end);
  const [ix1, iy1] = overviewPolar(cx, cy, innerR, end);
  const [ix2, iy2] = overviewPolar(cx, cy, innerR, startAngle);
  const large = s > 180 ? 1 : 0;
  return [
    `M ${ox1} ${oy1}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${ox2} ${oy2}`,
    `L ${ix1} ${iy1}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2}`,
    'Z',
  ].join(' ');
}

/**
 * Leader-line kiểu ClickUp: rim → radial elbow → ngang tới neo chữ.
 * Góc 0 = đỉnh; chỉ segment có sweep > 0.
 */
export function overviewDonutCalloutPoints(
  segments = [],
  { cx = 100, cy = 80, rimR = 40, elbowR = 52, labelPad = 14, labelX = null } = {}
) {
  const rightX = Number.isFinite(labelX) ? labelX : cx + elbowR + labelPad + 8;
  const leftX = Number.isFinite(labelX) ? 2 * cx - labelX : cx - elbowR - labelPad - 8;
  return (segments || [])
    .filter((seg) => Number(seg.sweepAngle) > 0.5)
    .map((seg) => {
      const mid = Number.isFinite(seg.midAngle)
        ? seg.midAngle
        : Number(seg.startAngle) + Number(seg.sweepAngle) / 2;
      const norm = ((mid % 360) + 360) % 360;
      // Nửa phải vòng (0–180 theo polar từ đỉnh) → chữ bên phải.
      const onRight = norm >= 0 && norm < 180;
      const [x1, y1] = overviewPolar(cx, cy, rimR, mid);
      const [x2, y2] = overviewPolar(cx, cy, elbowR, mid);
      const x3 = onRight ? rightX : leftX;
      const y3 = y2;
      return {
        key: seg.key,
        midAngle: mid,
        x1,
        y1,
        x2,
        y2,
        x3,
        y3,
        textAnchor: onRight ? 'start' : 'end',
        dx: onRight ? 5 : -5,
        count: Number(seg.count) || 0,
        pct: Number(seg.pct) || 0,
        labelKey: seg.labelKey || '',
        label: seg.label || '',
        fillClass: seg.fillClass || '',
        barClass: seg.barClass || '',
      };
    });
}

/** Card có field priority khác rỗng → đủ dữ liệu vẽ Priority chart. */
export function cardsHavePriorityField(cards = []) {
  return (cards || []).some((card) => {
    if (!card || typeof card !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(card, 'priority')) return false;
    const raw = card.priority;
    return raw != null && String(raw).trim() !== '';
  });
}

function countCardsByPriority(cards = [], priorityConfig) {
  const { items } = normalizePriorityConfig(priorityConfig);
  const counts = new Map(items.map((i) => [i.key, 0]));
  let none = 0;
  for (const card of cards || []) {
    if (!Object.prototype.hasOwnProperty.call(card || {}, 'priority')) {
      none += 1;
      continue;
    }
    const raw = card.priority;
    if (raw == null || String(raw).trim() === '') {
      none += 1;
      continue;
    }
    const key = slugPriorityKey(raw);
    if (!key) {
      none += 1;
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = items.map((item) => ({
    key: item.key,
    label: item.label,
    labelKey: OVERVIEW_PRIORITY_LABEL_KEY[item.key] || '',
    barClass: OVERVIEW_PRIORITY_BAR_CLASS[item.key] || 'bg-muted-foreground/30',
    fillClass: OVERVIEW_PRIORITY_FILL_CLASS[item.key] || 'fill-muted-foreground/30',
    count: counts.get(item.key) || 0,
  }));
  const knownKeys = new Set(items.map((i) => i.key));
  for (const [key, count] of counts.entries()) {
    if (knownKeys.has(key) || !count) continue;
    rows.push({
      key,
      label: key,
      labelKey: '',
      barClass: 'bg-muted-foreground/30',
      fillClass: 'fill-muted-foreground/30',
      count,
    });
  }
  if (none > 0) {
    rows.push({
      key: 'none',
      label: 'None',
      labelKey: OVERVIEW_PRIORITY_LABEL_KEY.none,
      barClass: OVERVIEW_PRIORITY_BAR_CLASS.none,
      fillClass: OVERVIEW_PRIORITY_FILL_CLASS.none,
      count: none,
    });
  }
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  // Catalog (Low/Medium/High/Urgent) luôn giữ đủ cột; "none" chỉ khi có count.
  const catalogKeys = new Set(items.map((i) => i.key));
  const segments = rows
    .filter((row) => catalogKeys.has(row.key) || row.count > 0)
    .map((row) => ({ ...row, pct: overviewPct(row.count, total) }));
  return { total, segments };
}

/** Palette người gán — không dùng muted (dành Unassigned). */
const OVERVIEW_ASSIGNEE_FILL = [
  'fill-primary',
  'fill-success',
  'fill-warning',
  'fill-destructive',
  'fill-primary/60',
  'fill-success/70',
];

const OVERVIEW_ASSIGNEE_BAR = [
  'bg-primary',
  'bg-success',
  'bg-warning',
  'bg-destructive',
  'bg-primary/60',
  'bg-success/70',
];

const OVERVIEW_ASSIGNEE_UNASSIGNED_FILL = 'fill-muted-foreground/45';
const OVERVIEW_ASSIGNEE_UNASSIGNED_BAR = 'bg-muted-foreground/45';
const OVERVIEW_ASSIGNEE_OTHER_FILL = 'fill-muted-foreground/30';
const OVERVIEW_ASSIGNEE_OTHER_BAR = 'bg-muted-foreground/30';

const OVERVIEW_ASSIGNEE_TOP_N = 5;

function attachDonutAngles(segments = []) {
  const total = segments.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  let angle = 0;
  return segments.map((row) => {
    const count = Number(row.count) || 0;
    const pct = overviewPct(count, total);
    const sweepAngle = total > 0 ? (count / total) * 360 : 0;
    const startAngle = angle;
    angle += sweepAngle;
    return {
      ...row,
      pct,
      startAngle,
      sweepAngle,
      midAngle: startAngle + sweepAngle / 2,
    };
  });
}

/**
 * Open work theo assignee (+ Unassigned). Top N; phần còn lại gộp "other".
 * Tên từ card; members chỉ bổ sung khi card thiếu tên.
 */
export function countOpenCardsByAssignee(cards = [], lists = [], members = [], { topN = OVERVIEW_ASSIGNEE_TOP_N } = {}) {
  const listById = hubListById(lists);
  const byKey = new Map();
  let unassigned = 0;

  for (const card of cards || []) {
    if (!isHubCardOpen(card, listById)) continue;
    const id = String(card?.assigneeId || '').trim();
    let name = hubCardAssigneeName(card);
    if (!name && id) {
      name = memberDisplayName(findMemberByUserId(members, id)) || '';
    }
    if (!id && !name) {
      unassigned += 1;
      continue;
    }
    const key = id || `name:${name.toLowerCase()}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.count += 1;
      if (!prev.label && name) prev.label = name;
    } else {
      byKey.set(key, {
        key,
        label: name || (id ? id.slice(-6) : ''),
        labelKey: '',
        count: 1,
      });
    }
  }

  const ranked = [...byKey.values()].sort(
    (a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label))
  );
  const limit = Math.max(1, Number(topN) || OVERVIEW_ASSIGNEE_TOP_N);
  const head = ranked.slice(0, limit);
  const rest = ranked.slice(limit);
  const otherCount = rest.reduce((sum, row) => sum + row.count, 0);

  const rows = [];
  head.forEach((row, index) => {
    rows.push({
      ...row,
      fillClass: OVERVIEW_ASSIGNEE_FILL[index % OVERVIEW_ASSIGNEE_FILL.length],
      barClass: OVERVIEW_ASSIGNEE_BAR[index % OVERVIEW_ASSIGNEE_BAR.length],
    });
  });
  if (otherCount > 0) {
    rows.push({
      key: 'other',
      label: 'Other',
      labelKey: 'workspace.projectHubOverviewAssigneeOther',
      count: otherCount,
      fillClass: OVERVIEW_ASSIGNEE_OTHER_FILL,
      barClass: OVERVIEW_ASSIGNEE_OTHER_BAR,
    });
  }
  if (unassigned > 0) {
    rows.push({
      key: 'unassigned',
      label: 'Unassigned',
      labelKey: 'workspace.projectHubStatUnassigned',
      count: unassigned,
      fillClass: OVERVIEW_ASSIGNEE_UNASSIGNED_FILL,
      barClass: OVERVIEW_ASSIGNEE_UNASSIGNED_BAR,
    });
  }

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return {
    total,
    segments: attachDonutAngles(rows),
  };
}

/**
 * Model chart Overview Summary (FE-only): donut status + priority bars + assignee donut.
 * Không gọi API; không clone Edit/Add card ClickUp.
 */
export function buildOverviewDashboardCharts({
  cards = [],
  lists = [],
  issueCounts,
  priorityConfig,
  members = [],
} = {}) {
  const status = countIssuesByStatusBucket(cards, lists);
  const statusTotal =
    (Number(status.todo) || 0) + (Number(status.progress) || 0) + (Number(status.done) || 0);
  const statusSegments = attachDonutAngles(
    OVERVIEW_STATUS_SEGMENTS.map((meta) => ({
      key: meta.key,
      labelKey: meta.labelKey,
      barClass: meta.barClass,
      fillClass: meta.fillClass,
      count: Number(status[meta.key]) || 0,
    }))
  );

  const types = issueCounts || countCardsByIssueType(cards);
  const typeRows = OVERVIEW_TYPE_SEGMENTS.map((meta) => ({
    key: meta.key,
    labelKey: meta.labelKey,
    barClass: meta.barClass,
    count: Number(types[meta.key]) || 0,
  }));
  const otherCount = Number(types.other) || 0;
  if (otherCount > 0) {
    typeRows.push({
      key: 'other',
      labelKey: 'workspace.projectHubOverviewTypeOther',
      barClass: 'bg-muted-foreground/30',
      count: otherCount,
    });
  }
  const typeTotal = typeRows.reduce((sum, row) => sum + row.count, 0);
  const typeSegments = typeRows.map((row) => ({
    ...row,
    pct: overviewPct(row.count, typeTotal),
  }));

  const hasPriorityData = cardsHavePriorityField(cards);
  const priority = hasPriorityData
    ? countCardsByPriority(cards, priorityConfig)
    : { total: 0, segments: [] };

  const assignee = countOpenCardsByAssignee(cards, lists, members);
  const donePct = overviewPct(status.done, statusTotal);

  return {
    statusTotal,
    donePct,
    statusSegments,
    typeTotal,
    typeSegments,
    hasPriorityData,
    showPriorityChart: true,
    prioritySkippedReason: hasPriorityData ? '' : 'no_card_priority_field',
    priorityTotal: priority.total,
    prioritySegments: priority.segments,
    assigneeTotal: assignee.total,
    assigneeSegments: assignee.segments,
  };
}

/**
 * Hạng mục thuộc 1 lát/cột Overview chart (status | priority | assignee).
 * @returns {{ id: string, title: string, priority?: string, assigneeName?: string }[]}
 */
export function listOverviewChartSegmentCards({
  cards = [],
  lists = [],
  members = [],
  chart = 'status',
  segmentKey = '',
  topN = OVERVIEW_ASSIGNEE_TOP_N,
  limit = 40,
} = {}) {
  const key = String(segmentKey || '').trim();
  if (!key) return [];
  const listById = hubListById(lists);
  const kind = String(chart || '').toLowerCase();
  const out = [];

  if (kind === 'status') {
    for (const card of cards || []) {
      const list = listById.get(String(card?.listId || card?.list || ''));
      const bucket = classifyListStatusBucket(card?.status || list);
      if (bucket !== key) continue;
      out.push(overviewChartCardRow(card));
    }
  } else if (kind === 'priority') {
    for (const card of cards || []) {
      if (!Object.prototype.hasOwnProperty.call(card || {}, 'priority')) {
        if (key === 'none') out.push(overviewChartCardRow(card));
        continue;
      }
      const raw = card.priority;
      if (raw == null || String(raw).trim() === '') {
        if (key === 'none') out.push(overviewChartCardRow(card));
        continue;
      }
      const pKey = slugPriorityKey(raw);
      if (!pKey) {
        if (key === 'none') out.push(overviewChartCardRow(card));
        continue;
      }
      if (pKey === key) out.push(overviewChartCardRow(card));
    }
  } else if (kind === 'assignee') {
    const openCards = (cards || []).filter((c) => isHubCardOpen(c, listById));
    const rankedKeys = [];
    const byKey = new Map();
    for (const card of openCards) {
      const id = String(card?.assigneeId || '').trim();
      let name = hubCardAssigneeName(card);
      if (!name && id) {
        name = memberDisplayName(findMemberByUserId(members, id)) || '';
      }
      if (!id && !name) {
        const prev = byKey.get('unassigned') || [];
        prev.push(card);
        byKey.set('unassigned', prev);
        continue;
      }
      const aKey = id || `name:${name.toLowerCase()}`;
      if (!byKey.has(aKey)) rankedKeys.push(aKey);
      const prev = byKey.get(aKey) || [];
      prev.push(card);
      byKey.set(aKey, prev);
    }
    rankedKeys.sort((a, b) => {
      const ca = (byKey.get(a) || []).length;
      const cb = (byKey.get(b) || []).length;
      if (cb !== ca) return cb - ca;
      return a.localeCompare(b);
    });
    const limitN = Math.max(1, Number(topN) || OVERVIEW_ASSIGNEE_TOP_N);
    const headKeys = new Set(rankedKeys.slice(0, limitN));
    const restKeys = rankedKeys.slice(limitN);

    let match = [];
    if (key === 'unassigned') {
      match = byKey.get('unassigned') || [];
    } else if (key === 'other') {
      for (const rk of restKeys) match.push(...(byKey.get(rk) || []));
    } else if (headKeys.has(key)) {
      match = byKey.get(key) || [];
    }
    for (const card of match) out.push(overviewChartCardRow(card));
  }

  out.sort((a, b) => a.title.localeCompare(b.title));
  const cap = Math.max(1, Number(limit) || 40);
  return out.slice(0, cap);
}

function overviewChartCardRow(card) {
  return {
    id: String(card?._id || card?.id || ''),
    title: String(card?.title || '').trim() || '—',
    priority: card?.priority != null ? String(card.priority) : '',
    assigneeName: hubCardAssigneeName(card) || '',
  };
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

/** Duration UI keys → số ngày. `custom` → null (không auto tính end). */
export const SPRINT_DURATION_DAYS = Object.freeze({
  '1w': 7,
  '2w': 14,
  '3w': 21,
  '4w': 28,
  custom: null,
});

export function getSprintDurationDays(duration) {
  const key = String(duration || '').trim();
  if (!Object.prototype.hasOwnProperty.call(SPRINT_DURATION_DAYS, key)) return null;
  return SPRINT_DURATION_DAYS[key];
}

/**
 * Tính end datetime-local từ duration cố định; `custom` trả lại end hiện tại (không đổi).
 * @returns {{ duration: string, endDate: string }}
 */
export function applySprintDuration(duration, startDateTimeLocal, currentEndDateTimeLocal = '') {
  const next = String(duration || 'custom').trim() || 'custom';
  const days = getSprintDurationDays(next);
  if (days == null) {
    return { duration: 'custom', endDate: currentEndDateTimeLocal || '' };
  }
  const base = startDateTimeLocal || toDateTimeLocalValue(new Date());
  return { duration: next, endDate: addDaysToDateTimeLocal(base, days) };
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

export function isCardInSprint(card, sprintId, { allCards = [] } = {}) {
  const sid = String(sprintId || '').trim();
  if (!sid) return false;
  if (String(card?.sprintId || '').trim() === sid) return true;

  const kind = String(card?.kind || '').toLowerCase();
  const issueType = String(card?.issueType || card?.type || '').toLowerCase();
  const isFeature = kind === 'planning' || issueType === 'feature';
  if (!isFeature) return false;

  const featureId = String(card?._id || card?.id || '').trim();
  if (!featureId) return false;
  return (Array.isArray(allCards) ? allCards : []).some((child) => {
    if (String(child?.featureId || '').trim() !== featureId) return false;
    return String(child?.sprintId || '').trim() === sid;
  });
}
