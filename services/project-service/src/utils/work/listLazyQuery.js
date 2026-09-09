/** Query List lazy-load: planning-items + board cards (không route mới). */

const PLANNING_LIST_TYPES = ['roadmap', 'release', 'milestone', 'epic', 'feature'];

function invalid(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function looksLikeOid(id) {
  return /^[a-fA-F0-9]{24}$/.test(String(id || '').trim());
}

/** Mặc định true (Board / contract cũ). `0`/`false` → không trả cards. */
function parseIncludeCardsFlag(raw) {
  if (raw === undefined || raw === null || raw === '') return true;
  const s = String(raw).trim().toLowerCase();
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return true;
}

/**
 * Filter GET planning-items. `type` + `parentId` tùy chọn.
 * @param {{ projectId: unknown, type?: string, parentId?: string }} input
 * @param {{ isValidOid?: (id: string) => boolean }} [opts]
 */
function buildPlanningListFilter({ projectId, type, parentId } = {}, { isValidOid } = {}) {
  const filter = { projectId, isActive: true };
  if (type) {
    const t = String(type || '').trim().toLowerCase();
    if (!PLANNING_LIST_TYPES.includes(t)) throw invalid('type không hợp lệ');
    filter.type = t;
  }
  if (parentId) {
    const pid = String(parentId || '').trim();
    const ok = typeof isValidOid === 'function' ? isValidOid(pid) : looksLikeOid(pid);
    if (!ok) throw invalid('parentId không hợp lệ');
    filter.parentId = pid;
  }
  return filter;
}

function missingOidClause(field) {
  return { $or: [{ [field]: null }, { [field]: { $exists: false } }] };
}

/**
 * Filter Task.find cho GET board. Ưu tiên parentTaskId > featureId > epicId.
 * epic/feature: chỉ card cấp trực tiếp (không parentTaskId; epic không kèm featureId).
 */
function buildBoardCardMongoFilter(
  { boardId, epicId, featureId, parentTaskId } = {},
  { isValidOid, toOid } = {}
) {
  const valid = (id) => {
    const s = String(id || '').trim();
    return typeof isValidOid === 'function' ? isValidOid(s) : looksLikeOid(s);
  };
  const oid = (id) => (typeof toOid === 'function' ? toOid(id) : id);
  const base = { boardId, isActive: true };

  if (parentTaskId) {
    if (!valid(parentTaskId)) throw invalid('parentTaskId không hợp lệ');
    return { ...base, parentTaskId: oid(parentTaskId) };
  }
  if (featureId) {
    if (!valid(featureId)) throw invalid('featureId không hợp lệ');
    return {
      ...base,
      featureId: oid(featureId),
      $or: missingOidClause('parentTaskId').$or,
    };
  }
  if (epicId) {
    if (!valid(epicId)) throw invalid('epicId không hợp lệ');
    return {
      ...base,
      epicId: oid(epicId),
      $and: [missingOidClause('parentTaskId'), missingOidClause('featureId')],
    };
  }
  return base;
}

module.exports = {
  PLANNING_LIST_TYPES,
  parseIncludeCardsFlag,
  buildPlanningListFilter,
  buildBoardCardMongoFilter,
};
