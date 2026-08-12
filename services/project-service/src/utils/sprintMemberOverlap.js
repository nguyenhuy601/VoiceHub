/**
 * Concurrent sprint start: member sets from Task assignees must not overlap
 * across active sprints in the same project.
 */

function normalizeUserId(raw) {
  const id = String(raw || '').trim();
  return id || '';
}

/**
 * Collect unique assignee user ids from task rows.
 * Sources: assigneeId + assignments[].userId (all slots).
 * @param {Array<{ assigneeId?: unknown, assignments?: Array<{ userId?: unknown }> }>} tasks
 * @returns {Set<string>}
 */
function collectSprintMemberIds(tasks) {
  const out = new Set();
  for (const task of tasks || []) {
    const primary = normalizeUserId(task?.assigneeId);
    if (primary) out.add(primary);
    for (const row of task?.assignments || []) {
      const uid = normalizeUserId(row?.userId);
      if (uid) out.add(uid);
    }
  }
  return out;
}

/**
 * @param {Set<string>|string[]} a
 * @param {Set<string>|string[]} b
 * @returns {string[]}
 */
function intersectionUserIds(a, b) {
  const setA = a instanceof Set ? a : new Set(a || []);
  const setB = b instanceof Set ? b : new Set(b || []);
  const out = [];
  for (const id of setA) {
    if (setB.has(id)) out.push(id);
  }
  return out;
}

/**
 * @param {{
 *   candidateSprintId: string,
 *   candidateMemberIds: Set<string>|string[],
 *   activeSprintsWithMembers: Array<{ sprintId: string, memberIds: Set<string>|string[] }>
 * }} params
 * @returns {null | { sprintId: string, overlappingUserIds: string[] }}
 */
function findOverlappingActiveSprint({
  candidateSprintId,
  candidateMemberIds,
  activeSprintsWithMembers,
} = {}) {
  const candidateId = normalizeUserId(candidateSprintId);
  const candidate = candidateMemberIds instanceof Set
    ? candidateMemberIds
    : new Set(candidateMemberIds || []);

  for (const row of activeSprintsWithMembers || []) {
    const sprintId = normalizeUserId(row?.sprintId);
    if (!sprintId || (candidateId && sprintId === candidateId)) continue;
    const overlappingUserIds = intersectionUserIds(candidate, row?.memberIds || []);
    if (overlappingUserIds.length) {
      return { sprintId, overlappingUserIds };
    }
  }
  return null;
}

function makeOverlapError(overlap) {
  const err = new Error(
    'Không thể start sprint: có thành viên đang tham gia sprint đang chạy khác'
  );
  err.statusCode = 409;
  err.errorCode = 'SPRINT_MEMBER_OVERLAP';
  err.overlap = overlap || null;
  return err;
}

/**
 * Guard before activating a sprint. No-op when already active or no other actives.
 * @param {{ projectId: string, sprintId: string, Sprint?: object, Task?: object }} params
 */
async function assertNoMemberOverlapWithActiveSprints({
  projectId,
  sprintId,
  Sprint: SprintModel,
  Task: TaskModel,
} = {}) {
  const pid = normalizeUserId(projectId);
  const sid = normalizeUserId(sprintId);
  if (!pid || !sid) {
    const err = new Error('projectId và sprintId là bắt buộc');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_ERROR';
    throw err;
  }

  const Sprint = SprintModel || require('../models/Sprint');
  const Task = TaskModel || require('../models/Task');

  const candidate = await Sprint.findOne({ _id: sid, projectId: pid })
    .select('_id status')
    .lean();
  if (!candidate) {
    const err = new Error('Sprint không tồn tại');
    err.statusCode = 404;
    err.errorCode = 'SPRINT_NOT_FOUND';
    throw err;
  }
  if (String(candidate.status || '').toLowerCase() === 'active') {
    return { skipped: true, reason: 'already_active' };
  }

  const otherActive = await Sprint.find({
    projectId: pid,
    status: 'active',
    _id: { $ne: sid },
  })
    .select('_id')
    .lean();

  if (!otherActive.length) {
    return { skipped: true, reason: 'no_other_active' };
  }

  const sprintIds = [sid, ...otherActive.map((s) => String(s._id))];
  const tasks = await Task.find({
    projectId: pid,
    sprintId: { $in: sprintIds },
    isActive: true,
  })
    .select('sprintId assigneeId assignments.userId')
    .lean();

  /** @type {Map<string, object[]>} */
  const tasksBySprint = new Map();
  for (const id of sprintIds) tasksBySprint.set(String(id), []);
  for (const task of tasks || []) {
    const key = String(task.sprintId || '');
    if (!tasksBySprint.has(key)) tasksBySprint.set(key, []);
    tasksBySprint.get(key).push(task);
  }

  const candidateMemberIds = collectSprintMemberIds(tasksBySprint.get(sid) || []);
  const activeSprintsWithMembers = otherActive.map((s) => {
    const id = String(s._id);
    return {
      sprintId: id,
      memberIds: collectSprintMemberIds(tasksBySprint.get(id) || []),
    };
  });

  const overlap = findOverlappingActiveSprint({
    candidateSprintId: sid,
    candidateMemberIds,
    activeSprintsWithMembers,
  });
  if (overlap) {
    throw makeOverlapError(overlap);
  }
  return { skipped: false, ok: true };
}

module.exports = {
  collectSprintMemberIds,
  intersectionUserIds,
  findOverlappingActiveSprint,
  assertNoMemberOverlapWithActiveSprints,
  makeOverlapError,
};
