const { buildTaskVisibilityFilter } = require('./taskWorkspaceScope');

const DONE_STATUSES = ['done', 'cancelled'];

function emptyStatusCounts() {
  return {
    total: 0,
    todo: 0,
    in_progress: 0,
    review: 0,
    done: 0,
    cancelled: 0,
  };
}

function formatStatusCounts(groups) {
  const formatted = emptyStatusCounts();
  (Array.isArray(groups) ? groups : []).forEach((s) => {
    if (s?._id && Object.prototype.hasOwnProperty.call(formatted, s._id)) {
      formatted[s._id] = Number(s.count) || 0;
      formatted.total += formatted[s._id];
    }
  });
  return formatted;
}

function isLikelyObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || '').trim());
}

function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dashboardDateWindow(now = new Date()) {
  const startToday = utcDayStart(now);
  const endWeek = new Date(startToday.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { now, startToday, endWeek };
}

function countFacet(rows) {
  return Number(rows?.[0]?.n) || 0;
}

/** Thẻ Kanban dùng ownerTeamId; visibility filter cũ chỉ teamId — bổ sung song song. */
function buildDashboardVisibilityMatch(scope, userId, toOid) {
  const base = buildTaskVisibilityFilter(scope, userId);
  if (Array.isArray(base.$or)) {
    const extra = [];
    for (const clause of base.$or) {
      if (clause.teamId) extra.push({ ownerTeamId: clause.teamId });
    }
    if (extra.length) base.$or = [...base.$or, ...extra];
  }
  if (typeof toOid !== 'function') return base;
  return castMatchObjectIds(base, toOid);
}

const ID_KEYS = ['assigneeId', 'createdBy', 'divisionId', 'departmentId', 'teamId', 'ownerTeamId'];

function castIdValue(value, toOid) {
  if (value == null) return value;
  if (value.$in) {
    return { $in: value.$in.map((item) => toOid(item) || item) };
  }
  return toOid(value) || value;
}

function castMatchObjectIds(match, toOid) {
  if (!match || typeof match !== 'object') return match;
  const out = { ...match };
  ID_KEYS.forEach((key) => {
    if (out[key] !== undefined) out[key] = castIdValue(out[key], toOid);
  });
  if (Array.isArray(out.$or)) {
    out.$or = out.$or.map((clause) => {
      const next = { ...clause };
      ID_KEYS.forEach((key) => {
        if (next[key] !== undefined) next[key] = castIdValue(next[key], toOid);
      });
      return next;
    });
  }
  return out;
}

const OVERDUE_ITEMS_LIMIT = 8;

function formatOverdueItems(rows, titleById, fallbackOrgId) {
  const map = titleById instanceof Map ? titleById : new Map();
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const id = row?._id || row?.id;
      if (!id) return null;
      const boardId = row.boardId ? String(row.boardId) : '';
      const due = row.dueDate ? new Date(row.dueDate) : null;
      return {
        id: String(id),
        title: String(row.title || '').trim() || String(id),
        dueDate: due && !Number.isNaN(due.getTime()) ? due.toISOString() : null,
        boardId,
        boardName: (boardId && map.get(boardId)) || '',
        assigneeId: row.assigneeId ? String(row.assigneeId) : null,
        organizationId: String(row.organizationId || fallbackOrgId || ''),
      };
    })
    .filter(Boolean);
}

module.exports = {
  DONE_STATUSES,
  emptyStatusCounts,
  formatStatusCounts,
  isLikelyObjectId,
  utcDayStart,
  dashboardDateWindow,
  countFacet,
  buildDashboardVisibilityMatch,
  castMatchObjectIds,
  OVERDUE_ITEMS_LIMIT,
  formatOverdueItems,
};
