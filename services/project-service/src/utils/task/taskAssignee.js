/**
 * Resolve whether a user is responsible for a task (primary assignee or assignment slot).
 */

function isTaskAssignee(task, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !task) return false;
  if (task.assigneeId && String(task.assigneeId) === uid) return true;
  const assignments = Array.isArray(task.assignments) ? task.assignments : [];
  return assignments.some((a) => a?.userId && String(a.userId) === uid);
}

function collectTaskAssigneeIds(task) {
  const ids = new Set();
  if (!task) return ids;
  if (task.assigneeId) ids.add(String(task.assigneeId));
  const assignments = Array.isArray(task.assignments) ? task.assignments : [];
  for (const a of assignments) {
    if (a?.userId) ids.add(String(a.userId));
  }
  return ids;
}

module.exports = {
  isTaskAssignee,
  collectTaskAssigneeIds,
};
