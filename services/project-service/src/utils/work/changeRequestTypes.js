/** ChangeRequest type / priority / status — Phase 1 (pure). */

const CHANGE_REQUEST_TYPES = Object.freeze([
  'requirement_change',
  'scope_change',
  'design_change',
  'technical_change',
  'other',
]);

const CHANGE_REQUEST_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'critical']);

const CHANGE_REQUEST_STATUSES = Object.freeze([
  'draft',
  'pending',
  'reviewing',
  'approved',
  'rejected',
  'deferred',
]);

/** Allowed status transitions (Phase 5). Terminal: approved / rejected / deferred. */
const CHANGE_REQUEST_STATUS_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['pending']),
  pending: Object.freeze(['reviewing']),
  reviewing: Object.freeze(['approved', 'rejected', 'deferred']),
  approved: Object.freeze([]),
  rejected: Object.freeze([]),
  deferred: Object.freeze([]),
});

const CR_LIST_SORT_FIELDS = Object.freeze([
  'createdAt',
  'updatedAt',
  'code',
  'title',
  'type',
  'priority',
  'status',
]);

const CR_LIST_DEFAULT_PAGE_SIZE = 20;
const CR_LIST_MAX_PAGE_SIZE = 100;

function invalid(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function normalizeCrToken(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function normalizeChangeRequestType(raw) {
  const t = normalizeCrToken(raw);
  return CHANGE_REQUEST_TYPES.includes(t) ? t : null;
}

function normalizeChangeRequestPriority(raw, fallback = 'medium') {
  const p = normalizeCrToken(raw);
  if (!p) return fallback;
  return CHANGE_REQUEST_PRIORITIES.includes(p) ? p : null;
}

function normalizeChangeRequestStatus(raw, fallback = null) {
  const s = normalizeCrToken(raw);
  if (!s) return fallback;
  return CHANGE_REQUEST_STATUSES.includes(s) ? s : null;
}

function listAllowedChangeRequestStatusTransitions(from) {
  const fromStatus = normalizeChangeRequestStatus(from);
  if (!fromStatus) return [];
  return [...(CHANGE_REQUEST_STATUS_TRANSITIONS[fromStatus] || [])];
}

/**
 * Enforce CR status transition. Same status → no-op (return to).
 * @returns {string} normalized target status
 */
function assertChangeRequestStatusTransition(from, to) {
  const fromStatus = normalizeChangeRequestStatus(from);
  const toStatus = normalizeChangeRequestStatus(to);
  if (!fromStatus || !toStatus) throw invalid('status không hợp lệ');
  if (fromStatus === toStatus) return toStatus;
  const allowed = CHANGE_REQUEST_STATUS_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw invalid(`Không thể chuyển status từ ${fromStatus} sang ${toStatus}`);
  }
  return toStatus;
}

/** Description bắt buộc (create / patch khi gửi field). */
function assertRequiredChangeRequestDescription(raw) {
  const desc = String(raw || '').trim();
  if (!desc) throw invalid('description là bắt buộc');
  return desc;
}

/** Current — optional, chỉ trim. */
function normalizeOptionalChangeRequestCurrent(raw) {
  return String(raw || '').trim();
}

/** Requested Change bắt buộc (create / patch khi gửi field). */
function assertRequiredChangeRequestRequestedChange(raw) {
  const text = String(raw || '').trim();
  if (!text) throw invalid('requestedChange là bắt buộc');
  return text;
}

const CR_IMPACT_KEYS = Object.freeze([
  'affectedRequirement',
  'affectedFeature',
  'affectedSprint',
  'affectedTeam',
  'estimatedEffort',
  'scheduleImpact',
  'costImpact',
  'risk',
]);

const CR_IMPACT_MAX = Object.freeze({
  affectedRequirement: 2000,
  affectedFeature: 2000,
  affectedSprint: 500,
  affectedTeam: 500,
  estimatedEffort: 500,
  scheduleImpact: 2000,
  costImpact: 2000,
  risk: 2000,
});

function emptyChangeRequestImpact() {
  return {
    affectedRequirement: '',
    affectedFeature: '',
    affectedSprint: '',
    affectedTeam: '',
    estimatedEffort: '',
    scheduleImpact: '',
    costImpact: '',
    risk: '',
  };
}

/** Normalize impact object (partial merge-friendly). */
function normalizeChangeRequestImpact(raw, base = null) {
  const out = { ...(base && typeof base === 'object' ? base : emptyChangeRequestImpact()) };
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of CR_IMPACT_KEYS) {
    if (raw[key] === undefined) continue;
    const max = CR_IMPACT_MAX[key] || 2000;
    out[key] = String(raw[key] || '')
      .trim()
      .slice(0, max);
  }
  return out;
}

/** Terminal statuses that require ApprovalRequest when project has CR policy. */
function isChangeRequestApprovalTerminalStatus(status) {
  const s = normalizeChangeRequestStatus(status);
  return s === 'approved' || s === 'rejected';
}

function escapeRegex(raw) {
  return String(raw || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * page / size / sort / q cho GET change-requests.
 * @param {{ q?: string, sort?: string, page?: string|number, size?: string|number }} input
 */
function parseChangeRequestListQuery({ q, sort, page, size } = {}) {
  const query = String(q || '').trim();
  const sortRaw = String(sort == null || sort === '' ? '-createdAt' : sort).trim();
  const desc = sortRaw.startsWith('-');
  const field = (desc ? sortRaw.slice(1) : sortRaw.replace(/^\+/, '')).trim();
  if (!CR_LIST_SORT_FIELDS.includes(field)) throw invalid('sort không hợp lệ');
  const pageNum = Math.max(1, Number.parseInt(String(page ?? '1'), 10) || 1);
  let sizeNum = Number.parseInt(String(size ?? String(CR_LIST_DEFAULT_PAGE_SIZE)), 10);
  if (!Number.isFinite(sizeNum) || sizeNum < 1) sizeNum = CR_LIST_DEFAULT_PAGE_SIZE;
  sizeNum = Math.min(CR_LIST_MAX_PAGE_SIZE, sizeNum);
  return {
    q: query,
    sortField: field,
    sortDir: desc ? -1 : 1,
    sortMongo: { [field]: desc ? -1 : 1 },
    page: pageNum,
    size: sizeNum,
    skip: (pageNum - 1) * sizeNum,
  };
}

/**
 * Filter GET change-requests. type / status / priority / q tùy chọn.
 * @param {{ projectId: unknown, type?: string, status?: string, priority?: string, q?: string }} input
 */
function buildChangeRequestListFilter({ projectId, type, status, priority, q } = {}) {
  const filter = { projectId, isActive: true };
  if (type) {
    const t = normalizeChangeRequestType(type);
    if (!t) throw invalid('type không hợp lệ');
    filter.type = t;
  }
  if (status) {
    const s = normalizeChangeRequestStatus(status);
    if (!s) throw invalid('status không hợp lệ');
    filter.status = s;
  }
  if (priority) {
    const p = normalizeChangeRequestPriority(priority, null);
    if (!p) throw invalid('priority không hợp lệ');
    filter.priority = p;
  }
  const query = String(q || '').trim();
  if (query) {
    const rx = escapeRegex(query);
    filter.$or = [
      { code: { $regex: rx, $options: 'i' } },
      { title: { $regex: rx, $options: 'i' } },
    ];
  }
  return filter;
}

/** Work đã gắn CR chưa (so sánh string id). */
function isChangeRequestWorkItemLinked(workItemIds, taskId) {
  const tid = String(taskId || '').trim();
  if (!tid) return false;
  return (Array.isArray(workItemIds) ? workItemIds : []).some((id) => String(id) === tid);
}

/** Map workItemIds → summary objects từ Map id→summary (list enrich). */
function pickWorkItemsForIds(workItemIds, summaryById) {
  const map = summaryById instanceof Map ? summaryById : new Map();
  return (Array.isArray(workItemIds) ? workItemIds : [])
    .map((id) => map.get(String(id)))
    .filter(Boolean);
}

const CR_STATUS_NOTIFY_ASSIGNEES = new Set(['reviewing', 'approved', 'rejected']);

function shouldNotifyAssigneesOnCrStatus(status) {
  return CR_STATUS_NOTIFY_ASSIGNEES.has(String(status || '').toLowerCase());
}

/** Pipeline rank — nhỏ hơn = sớm hơn (todo trước done). Unknown → 5. */
const WORK_STATUS_RANK_BY_KEY = Object.freeze({
  todo: 0,
  open: 0,
  doing: 1,
  in_progress: 1,
  dev: 1,
  analysis: 1,
  review: 2,
  code_review: 2,
  qa: 2,
  uat: 2,
  deploy: 3,
  done: 4,
  completed: 4,
  cancelled: 5,
  canceled: 5,
});

const WORK_STATUS_UNKNOWN_RANK = 5;

function normalizeWorkStatusKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

/**
 * Rank canonical của statusKey work. Không map được → 5.
 * @param {unknown} statusKey
 * @returns {number}
 */
function rankWorkStatusKey(statusKey) {
  const key = normalizeWorkStatusKey(statusKey);
  if (!key) return WORK_STATUS_UNKNOWN_RANK;
  if (Object.prototype.hasOwnProperty.call(WORK_STATUS_RANK_BY_KEY, key)) {
    return WORK_STATUS_RANK_BY_KEY[key];
  }
  return WORK_STATUS_UNKNOWN_RANK;
}

/**
 * Trạng thái work thấp nhất trên pipeline (todo trước done).
 * Cùng rank → listOrder nhỏ hơn. Không work → ''.
 * @param {Array<{ status?: string, statusKey?: string, listOrder?: number, order?: number }>} works
 * @returns {string}
 */
function pickLowestLinkedWorkStatus(works) {
  const list = Array.isArray(works) ? works : [];
  let winnerKey = '';
  let winnerRank = Infinity;
  let winnerOrder = Infinity;
  for (const work of list) {
    const key = normalizeWorkStatusKey(work?.statusKey || work?.status);
    if (!key) continue;
    const rank = rankWorkStatusKey(key);
    const order = Number(work?.listOrder ?? work?.order);
    const listOrder = Number.isFinite(order) ? order : 0;
    if (rank < winnerRank || (rank === winnerRank && listOrder < winnerOrder)) {
      winnerKey = key;
      winnerRank = rank;
      winnerOrder = listOrder;
    }
  }
  return winnerKey;
}

/**
 * workStatus DTO: khi có workItems thì compute; không thì dùng giá trị đã lưu.
 * @param {unknown} stored
 * @param {unknown} workItems
 * @returns {string}
 */
function resolveChangeRequestWorkStatus(stored, workItems) {
  if (Array.isArray(workItems)) return pickLowestLinkedWorkStatus(workItems);
  return normalizeWorkStatusKey(stored);
}

module.exports = {
  CHANGE_REQUEST_TYPES,
  CHANGE_REQUEST_PRIORITIES,
  CHANGE_REQUEST_STATUSES,
  CHANGE_REQUEST_STATUS_TRANSITIONS,
  CR_LIST_SORT_FIELDS,
  CR_LIST_DEFAULT_PAGE_SIZE,
  CR_LIST_MAX_PAGE_SIZE,
  normalizeChangeRequestType,
  normalizeChangeRequestPriority,
  normalizeChangeRequestStatus,
  listAllowedChangeRequestStatusTransitions,
  assertChangeRequestStatusTransition,
  assertRequiredChangeRequestDescription,
  normalizeOptionalChangeRequestCurrent,
  assertRequiredChangeRequestRequestedChange,
  emptyChangeRequestImpact,
  normalizeChangeRequestImpact,
  isChangeRequestApprovalTerminalStatus,
  isChangeRequestWorkItemLinked,
  pickWorkItemsForIds,
  shouldNotifyAssigneesOnCrStatus,
  rankWorkStatusKey,
  pickLowestLinkedWorkStatus,
  resolveChangeRequestWorkStatus,
  CR_IMPACT_KEYS,
  parseChangeRequestListQuery,
  buildChangeRequestListFilter,
};
