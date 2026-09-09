/** CR status workflow — FE mirror of project-service changeRequestTypes transitions. */

export const CR_STATUS_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['pending']),
  pending: Object.freeze(['reviewing']),
  reviewing: Object.freeze(['approved', 'rejected', 'deferred']),
  approved: Object.freeze([]),
  rejected: Object.freeze([]),
  deferred: Object.freeze([]),
});

function normalizeCrStatus(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  return Object.prototype.hasOwnProperty.call(CR_STATUS_TRANSITIONS, s) ? s : '';
}

export function listAllowedCrStatusTransitions(from) {
  const fromStatus = normalizeCrStatus(from);
  if (!fromStatus) return [];
  return [...(CR_STATUS_TRANSITIONS[fromStatus] || [])];
}

/**
 * @returns {{ ok: true, to: string, changed: boolean } | { ok: false, message: string }}
 */
export function assertCrStatusTransition(from, to) {
  const fromStatus = normalizeCrStatus(from);
  const toStatus = normalizeCrStatus(to);
  if (!fromStatus || !toStatus) {
    return { ok: false, message: 'status không hợp lệ' };
  }
  if (fromStatus === toStatus) {
    return { ok: true, to: toStatus, changed: false };
  }
  const allowed = CR_STATUS_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    return {
      ok: false,
      message: `Không thể chuyển status từ ${fromStatus} sang ${toStatus}`,
    };
  }
  return { ok: true, to: toStatus, changed: true };
}

/** Pipeline rank — nhỏ hơn = sớm hơn (todo trước done). Mirror BE changeRequestTypes. */
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

export function rankWorkStatusKey(statusKey) {
  const key = normalizeWorkStatusKey(statusKey);
  if (!key) return WORK_STATUS_UNKNOWN_RANK;
  if (Object.prototype.hasOwnProperty.call(WORK_STATUS_RANK_BY_KEY, key)) {
    return WORK_STATUS_RANK_BY_KEY[key];
  }
  return WORK_STATUS_UNKNOWN_RANK;
}

/**
 * Trạng thái work thấp nhất trên pipeline. Không work → ''.
 * @param {Array<{ status?: string, statusKey?: string, listOrder?: number, order?: number }>} works
 */
export function pickLowestLinkedWorkStatus(works) {
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
 * Label work status from board list title; fallback to status key.
 */
export function labelCrWorkStatus(workStatus, lists = []) {
  const key = String(workStatus || '')
    .trim()
    .toLowerCase();
  if (!key) return '';
  for (const list of Array.isArray(lists) ? lists : []) {
    const statusKey = String(list?.statusKey || '')
      .trim()
      .toLowerCase();
    if (statusKey === key) {
      const title = String(list?.title || '').trim();
      if (title) return title;
    }
  }
  return key;
}
