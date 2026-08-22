/**
 * Map PlanningItem.status ↔ board listId (mirror client planningBoardStatus.js).
 * Pure helpers — dùng khi union Feature lên Kanban / move Feature.
 */

const { inferStatusKeyFromTitle } = require('./workflowTransition');

const LEGACY_STATUS_TO_SELECT_BUCKET = {
  planned: 'todo',
  active: 'doing',
  done: 'done',
  cancelled: 'cancelled',
};

const STATUS_SELECT_TITLE_BUCKETS = [
  { bucket: 'todo', titles: ['todo', 'to do', 'chua lam'] },
  { bucket: 'doing', titles: ['doing', 'in progress', 'dang lam'] },
  { bucket: 'review', titles: ['review', 'in review', 'cho duyet'] },
  { bucket: 'done', titles: ['done', 'xong', 'complete', 'completed'] },
  { bucket: 'cancelled', titles: ['cancelled', 'canceled', 'huy'] },
];

function listIdOf(list) {
  return String(list?._id || list?.id || '');
}

function asListArray(lists) {
  if (Array.isArray(lists)) return lists;
  if (lists && typeof lists === 'object') return Object.values(lists);
  return [];
}

function normalizeListTitleKey(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function hasListStatusKey(list) {
  return Boolean(String(list?.statusKey || '').trim());
}

function ensureListStatusKey(list) {
  const key = String(list?.statusKey || '').trim();
  if (key) return { ...list, statusKey: key };
  const inferred = inferStatusKeyFromTitle(list?.title);
  return { ...list, statusKey: inferred || '' };
}

/** Bucket UI thô: done | progress | todo */
function classifyListStatusBucket(listOrStatus) {
  const s = String(
    typeof listOrStatus === 'string'
      ? listOrStatus
      : listOrStatus?.statusKey || listOrStatus?.title || ''
  ).toLowerCase();
  if (s.includes('done') || s.includes('complete')) return 'done';
  if (s.includes('progress') || s.includes('doing') || s.includes('review')) return 'progress';
  return 'todo';
}

/** Bucket gộp cột EN/VI trùng nghĩa. */
function statusSelectBucket(list) {
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

/**
 * Ưu tiên cột có statusKey; một list / bucket.
 */
function listsForStatusSelect(lists = [], currentListId = '') {
  const arr = asListArray(lists).map(ensureListStatusKey);
  const current = String(currentListId || '');
  const hasWorkflowKey = arr.some(hasListStatusKey);
  const source = hasWorkflowKey ? arr.filter(hasListStatusKey) : arr;
  const byBucket = new Map();

  const score = (list) => {
    let s = 0;
    if (hasListStatusKey(list)) s += 2;
    s -= (Number(list?.order) || 0) / 1e6;
    return s;
  };

  for (const list of source) {
    const bucket = statusSelectBucket(list);
    const prev = byBucket.get(bucket);
    if (!prev || score(list) > score(prev)) byBucket.set(bucket, list);
  }

  let options = [...byBucket.values()];
  if (current) {
    const cur = arr.find((l) => listIdOf(l) === current);
    if (cur && !options.some((l) => listIdOf(l) === current)) {
      options = [...options, cur];
    }
  }
  options.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  return options;
}

/**
 * Map status PlanningItem (legacy hoặc statusKey) → listId cột board.
 */
function planningStatusToListId(status, lists = []) {
  const options = listsForStatusSelect(lists, '');
  if (!options.length) return '';
  const raw = String(status || 'planned').trim().toLowerCase();
  const byKey = options.find((l) => String(l.statusKey || '').trim().toLowerCase() === raw);
  if (byKey) return listIdOf(byKey);

  const selectBucket = LEGACY_STATUS_TO_SELECT_BUCKET[raw] || raw;
  const bySelect = options.find((l) => statusSelectBucket(l) === selectBucket);
  if (bySelect) return listIdOf(bySelect);

  const uiBucket = classifyListStatusBucket(raw);
  const byUi = options.find((l) => classifyListStatusBucket(l) === uiBucket);
  if (byUi) return listIdOf(byUi);

  return listIdOf(options[0]);
}

/**
 * listId cột board → statusKey lưu trên PlanningItem.
 */
function listIdToPlanningStatus(listId, lists = []) {
  const id = String(listId || '');
  if (!id) return '';
  const arr = asListArray(lists).map(ensureListStatusKey);
  const list = arr.find((l) => listIdOf(l) === id);
  if (!list) return '';
  const key = String(list.statusKey || '').trim().toLowerCase();
  if (key) return key;
  return statusSelectBucket(list);
}

/**
 * listId cho Feature trên board: map status, fallback cột todo / order nhỏ nhất.
 */
function resolveFeatureBoardListId(status, lists = []) {
  const mapped = planningStatusToListId(status, lists);
  if (mapped) return mapped;
  const arr = asListArray(lists).map(ensureListStatusKey);
  if (!arr.length) return '';
  const todo = arr.find((l) => String(l.statusKey || '').trim().toLowerCase() === 'todo');
  if (todo) return listIdOf(todo);
  const sorted = [...arr].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  return listIdOf(sorted[0]);
}

/**
 * Sprint hiển thị cho Feature: ưu tiên sprintId Feature; không thì sprint phổ biến nhất của Task con.
 */
function resolveFeatureDisplaySprintId(featureSprintId, featureId, taskCards = []) {
  const own = featureSprintId != null && featureSprintId !== '' ? String(featureSprintId) : '';
  if (own) return own;
  const fid = String(featureId || '').trim();
  if (!fid) return null;
  const counts = new Map();
  for (const t of Array.isArray(taskCards) ? taskCards : []) {
    if (String(t?.featureId || '').trim() !== fid) continue;
    const sid = String(t?.sprintId || '').trim();
    if (!sid) continue;
    counts.set(sid, (counts.get(sid) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [sid, n] of counts) {
    if (n > bestN) {
      best = sid;
      bestN = n;
    }
  }
  return best;
}

module.exports = {
  planningStatusToListId,
  listIdToPlanningStatus,
  resolveFeatureBoardListId,
  resolveFeatureDisplaySprintId,
  classifyListStatusBucket,
  statusSelectBucket,
  listsForStatusSelect,
};
