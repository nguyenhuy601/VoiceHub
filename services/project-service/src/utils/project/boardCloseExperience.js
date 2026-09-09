/** Gom số thật khi đóng board — không bịa %. Watcher không việc → bỏ. */

const WATCHER_KEYS = new Set(['watcher', 'viewer']);

function sid(v) {
  return String(v || '').trim();
}

function formatDueDate(raw) {
  if (!raw) return '';
  const d = raw instanceof Date ? raw : new Date(raw);
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isTaskDone(task) {
  if (!task) return false;
  if (task.completedAt) return true;
  return String(task.status || '').trim().toLowerCase() === 'done';
}

function assignedUserIds(task) {
  const ids = new Set();
  const primary = sid(task?.assigneeId);
  if (primary) ids.add(primary);
  const rows = Array.isArray(task?.assignments) ? task.assignments : [];
  for (const a of rows) {
    const slot = String(a?.slot || 'primary').toLowerCase();
    if (slot === 'watcher') continue;
    const uid = sid(a?.userId);
    if (uid) ids.add(uid);
  }
  return ids;
}

function buildFactLine({ boardTitle, roleLabel, done, total, dueLabel }) {
  const parts = [String(boardTitle || '').trim(), String(roleLabel || '').trim()].filter(Boolean);
  if (Number.isFinite(total) && total > 0) {
    parts.push(`${done}/${total} việc xong`);
  } else if (Number.isFinite(done) && done > 0) {
    parts.push(`${done}/0 việc xong`);
  }
  if (dueLabel) parts.push(`hạn ${dueLabel}`);
  return parts.join(' · ').slice(0, 300);
}

/**
 * @param {{ board: object, memberships: object[], roles: object[], tasks: object[] }} input
 * @returns {Array<{ userId: string, name: string, role: string, work: string, year?: number, source: string, status: string, evidenceBoardId: string, isProjectManager: boolean }>}
 */
function buildClosedBoardExperiences({ board, memberships, roles, tasks } = {}) {
  const boardId = sid(board?._id || board?.id);
  const boardTitle = String(board?.title || '').trim() || 'Dự án';
  const dueLabel = formatDueDate(board?.dueDate);
  const yearRaw = board?.dueDate || board?.updatedAt || board?.createdAt;
  const yearDate = yearRaw ? new Date(yearRaw) : new Date();
  const year = Number.isFinite(yearDate.getTime()) ? yearDate.getFullYear() : undefined;

  const roleById = new Map();
  for (const r of roles || []) {
    roleById.set(sid(r._id || r.id), r);
  }

  const byUser = new Map();
  for (const m of memberships || []) {
    const uid = sid(m.userId);
    if (!uid) continue;
    if (!byUser.has(uid)) {
      byUser.set(uid, { roleKeys: new Set(), roleLabels: [] });
    }
    const rec = byUser.get(uid);
    const role = roleById.get(sid(m.projectRoleId));
    const key = String(role?.key || '').trim().toLowerCase();
    const label = String(role?.label || role?.key || '').trim();
    if (key) rec.roleKeys.add(key);
    if (label && !rec.roleLabels.includes(label)) rec.roleLabels.push(label);
  }

  const counts = new Map();
  for (const task of tasks || []) {
    const assignees = assignedUserIds(task);
    const done = isTaskDone(task);
    for (const uid of assignees) {
      if (!counts.has(uid)) counts.set(uid, { done: 0, total: 0 });
      const c = counts.get(uid);
      c.total += 1;
      if (done) c.done += 1;
    }
  }

  const out = [];
  for (const [userId, rec] of byUser.entries()) {
    const c = counts.get(userId) || { done: 0, total: 0 };
    const keys = rec.roleKeys;
    const watcherOnly = keys.size > 0 && [...keys].every((k) => WATCHER_KEYS.has(k));
    const noRole = keys.size === 0 && rec.roleLabels.length === 0;
    if ((watcherOnly || noRole) && c.total === 0) continue;

    const roleLabel =
      rec.roleLabels.find((l) => /project[_\s-]?manager|pm/i.test(l)) ||
      rec.roleLabels[0] ||
      [...keys][0] ||
      '';
    if (!roleLabel && c.total === 0) continue;

    const work = buildFactLine({
      boardTitle,
      roleLabel,
      done: c.done,
      total: c.total,
      dueLabel,
    });
    if (!work) continue;

    const item = {
      userId,
      name: boardTitle,
      role: String(roleLabel).slice(0, 120),
      work,
      source: 'closed_board',
      status: 'suggested',
      evidenceBoardId: boardId,
      isProjectManager: [...keys].includes('project_manager'),
    };
    if (year >= 1970 && year <= 2100) item.year = year;
    out.push(item);
  }

  return out;
}

module.exports = {
  buildClosedBoardExperiences,
  buildFactLine,
  formatDueDate,
  isTaskDone,
  assignedUserIds,
};
