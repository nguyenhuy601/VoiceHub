/**
 * Apply Gate 2 assignment edits onto the HOW container.
 * Role keys must be enabled project roles. User ids must already be on the
 * task shortlist for that same role, or be present in the org pool for the new role.
 */

const { resolveCanonicalProjectRoleKey } = require('@enterprise/shared/config/masterData');

const DISPLAY_NAME_MAX = 120;

function canonicalRole(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return '';
  return String(resolveCanonicalProjectRoleKey(key) || key).trim().toLowerCase();
}

function assignmentError(statusCode, errorCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

function decisionEntries(reviewDecisions) {
  if (!reviewDecisions || typeof reviewDecisions !== 'object') return [];
  if (Array.isArray(reviewDecisions)) {
    return reviewDecisions
      .map((row) => ({
        logicalId: String(row?.logicalId || row?.id || '').trim(),
        decision: row,
      }))
      .filter((row) => row.logicalId);
  }
  return Object.entries(reviewDecisions).map(([logicalId, decision]) => ({
    logicalId: String(logicalId || '').trim(),
    decision: decision && typeof decision === 'object' ? decision : {},
  }));
}

function taskIdSetOf(container) {
  const ids = new Set();
  for (const task of container?.planning?.tasks || []) {
    const id = String(task?.id || task?.taskId || '').trim();
    if (id) ids.add(id);
  }
  return ids;
}

function shortlistIds(container, taskId) {
  const ids = [];
  for (const rec of container?.resource?.recommendations || []) {
    if (String(rec?.taskId || '') !== String(taskId)) continue;
    const list = Array.isArray(rec.shortlist) ? rec.shortlist : rec.candidates || [];
    for (const candidate of list) {
      if (!candidate?.userId || candidate.feasible === false) continue;
      ids.push(String(candidate.userId));
    }
  }
  return ids;
}

function taskRole(container, taskId) {
  const task = (container?.planning?.tasks || []).find(
    (row) => String(row?.id || row?.taskId || '') === String(taskId)
  );
  return canonicalRole(task?.suggestedRoleKey);
}

/**
 * @returns {Array<{ logicalId: string, taskIds: string[], roleKey: string, userId: string, displayName: string }>}
 */
function listAssignmentEdits(reviewDecisions, container) {
  const known = taskIdSetOf(container);
  const edits = [];
  for (const { logicalId, decision } of decisionEntries(reviewDecisions)) {
    const action = String(decision?.action || '').toLowerCase();
    if (action !== 'edit' && action !== 'accept') continue;
    if (!logicalId.startsWith('asg:')) continue;
    if (action === 'accept' && !String(decision?.editedPayload?.assigneeUserId || '').trim()) continue;
    const payload = decision.editedPayload && typeof decision.editedPayload === 'object'
      ? decision.editedPayload
      : {};
    let taskIds = (Array.isArray(payload.taskIds) ? payload.taskIds : [])
      .map((id) => String(id || '').trim())
      .filter((id) => known.has(id));
    if (!taskIds.length) {
      const fromId = logicalId.slice(4);
      if (known.has(fromId)) taskIds = [fromId];
    }
    if (!taskIds.length) {
      throw assignmentError(
        400,
        'ASSIGNMENT_TASK_UNKNOWN',
        'Không xác định được công việc để đổi nhân sự.'
      );
    }
    const displayName = String(payload.assignee || '').trim();
    const score = Number(payload.score);
    const availableHours = Number(payload.availableHours);
    edits.push({
      logicalId,
      taskIds,
      roleKey: canonicalRole(payload.suggestedRoleKey),
      userId: String(payload.assigneeUserId || '').trim(),
      displayName: !displayName || displayName === '—' ? '' : displayName.slice(0, DISPLAY_NAME_MAX),
      score: Number.isFinite(score) ? score : null,
      availableHours: Number.isFinite(availableHours) ? availableHours : null,
      overload: payload.overload === true,
    });
  }
  return edits;
}

function allowedUsersForEdit(container, edit, usersByRole) {
  const allowed = new Set(
    (Array.isArray(usersByRole?.[edit.roleKey]) ? usersByRole[edit.roleKey] : []).map(String)
  );
  for (const taskId of edit.taskIds) {
    if (taskRole(container, taskId) !== edit.roleKey) continue;
    for (const id of shortlistIds(container, taskId)) allowed.add(id);
    const current = (container?.resource?.assignments || []).find(
      (row) => String(row?.taskId || '') === String(taskId)
    );
    if (current?.userId) allowed.add(String(current.userId));
  }
  return allowed;
}

/**
 * Fill usersByRole with pool hits for people who are not already on the shortlist.
 * @param {{ edits: object[], container: object, lookupUser: (roleKey: string, userId: string) => Promise<boolean> }} input
 */
async function loadUsersByRoleForEdits({ edits, container, lookupUser }) {
  const usersByRole = {};
  for (const edit of edits || []) {
    if (!edit?.userId || !edit.roleKey) continue;
    if (allowedUsersForEdit(container, edit, usersByRole).has(edit.userId)) continue;
    let ok = false;
    try {
      ok = await lookupUser(edit.roleKey, edit.userId);
    } catch (err) {
      throw assignmentError(
        err?.statusCode && err.statusCode < 500 ? err.statusCode : 502,
        'ASSIGNMENT_POOL_UNAVAILABLE',
        'Không đọc được danh sách nhân sự của vai trò này.'
      );
    }
    if (!ok) continue;
    if (!usersByRole[edit.roleKey]) usersByRole[edit.roleKey] = [];
    usersByRole[edit.roleKey].push(edit.userId);
  }
  return usersByRole;
}

function applyAssignmentReviewEdits(container, edits, { roleKeys = [], usersByRole = {} } = {}) {
  const roleAllow = new Set((roleKeys || []).map((key) => canonicalRole(key)).filter(Boolean));
  const nextTasks = (container?.planning?.tasks || []).map((task) => ({ ...task }));
  const taskById = new Map(nextTasks.map((task) => [String(task.id || task.taskId || ''), task]));
  const nextAssignments = (container?.resource?.assignments || []).map((row) => ({ ...row }));

  for (const edit of edits || []) {
    if (!edit.roleKey) {
      throw assignmentError(400, 'ASSIGNMENT_ROLE_REQUIRED', 'Cần chọn vai trò từ danh mục dự án.');
    }
    if (!roleAllow.has(edit.roleKey)) {
      throw assignmentError(
        400,
        'ASSIGNMENT_ROLE_UNKNOWN',
        `Vai trò không có trong danh mục dự án: ${edit.roleKey}`
      );
    }
    if (edit.userId && !allowedUsersForEdit(container, edit, usersByRole).has(edit.userId)) {
      throw assignmentError(
        400,
        'ASSIGNMENT_USER_UNKNOWN',
        'Nhân sự không thuộc vai trò này trong danh sách hệ thống.'
      );
    }
    for (const taskId of edit.taskIds) {
      const task = taskById.get(String(taskId));
      if (task) task.suggestedRoleKey = edit.roleKey;
      const index = nextAssignments.findIndex((row) => String(row?.taskId || '') === String(taskId));
      if (!edit.userId) {
        if (index >= 0) nextAssignments.splice(index, 1);
        continue;
      }
      const previous = index >= 0 ? nextAssignments[index] : null;
      const displayName = edit.displayName || String(previous?.displayName || '').trim();
      const effort = Number(task?.effortHours);
      const available = edit.availableHours;
      const overload =
        available != null && Number.isFinite(effort) && effort > 0
          ? effort > available
          : edit.overload === true;
      const row = {
        taskId,
        userId: edit.userId,
        ...(displayName ? { displayName } : {}),
        ...(edit.score != null ? { score: edit.score } : {}),
        ...(available != null ? { available_capacity: available } : {}),
        overload,
        rationale: 'gate2_review',
      };
      if (index >= 0) nextAssignments[index] = row;
      else nextAssignments.push(row);
    }
  }

  return {
    ...container,
    planning: {
      ...(container?.planning || {}),
      tasks: nextTasks,
    },
    resource: {
      ...(container?.resource || {}),
      assignments: nextAssignments,
    },
  };
}

module.exports = {
  canonicalRole,
  listAssignmentEdits,
  loadUsersByRoleForEdits,
  applyAssignmentReviewEdits,
  allowedUsersForEdit,
};
