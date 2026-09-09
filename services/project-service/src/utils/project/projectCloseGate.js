/**
 * Cổng đóng dự án / chặn PATCH đóng sprint — pure, reuse Done classifier.
 */

const { classifySprintClosureTasks } = require('./sprintCloseClassify');

function asStringOid(v) {
  return String(v || '').trim();
}

function hasSprintId(task) {
  const id = asStringOid(task?.sprintId);
  return Boolean(id) && id !== 'null' && id !== 'undefined';
}

function isLastOpenSprint(destinationSprints) {
  return !Array.isArray(destinationSprints) || destinationSprints.length === 0;
}

function countOpenSprints(sprints = []) {
  return (sprints || []).filter((s) => {
    const st = String(s?.status || '').toLowerCase();
    return st === 'planned' || st === 'active';
  }).length;
}

function classifyProjectIncompleteWork({ tasks = [], listsById = {} } = {}) {
  const stats = classifySprintClosureTasks({ tasks, listsById });
  const incompleteIdSet = new Set((stats.incompleteTaskIds || []).map((id) => asStringOid(id)));
  let backlogIncompleteCount = 0;
  let inSprintIncompleteCount = 0;
  for (const task of tasks || []) {
    const taskId = asStringOid(task?._id || task?.id);
    if (!taskId || !incompleteIdSet.has(taskId)) continue;
    if (hasSprintId(task)) inSprintIncompleteCount += 1;
    else backlogIncompleteCount += 1;
  }
  return {
    incompleteCount: stats.incompleteCount,
    doneCount: stats.doneCount,
    incompleteTaskIds: stats.incompleteTaskIds,
    backlogIncompleteCount,
    inSprintIncompleteCount,
  };
}

function throwCloseGateError({ errorCode, message, details }) {
  const err = new Error(message);
  err.statusCode = 409;
  err.errorCode = errorCode;
  err.details = details || null;
  throw err;
}

function evaluateProjectCloseGate({ openSprintCount, incomplete } = {}) {
  const open = Number(openSprintCount) || 0;
  if (open > 0) {
    return {
      ok: false,
      errorCode: 'OPEN_SPRINTS',
      message: `Không thể đóng dự án: còn ${open} sprint chưa đóng`,
      details: { openSprintCount: open },
    };
  }
  const incompleteCount = Number(incomplete?.incompleteCount) || 0;
  if (incompleteCount > 0) {
    const backlogIncompleteCount = Number(incomplete.backlogIncompleteCount) || 0;
    const inSprintIncompleteCount = Number(incomplete.inSprintIncompleteCount) || 0;
    return {
      ok: false,
      errorCode: 'INCOMPLETE_WORK',
      message: `Không thể đóng dự án: còn ${incompleteCount} việc chưa hoàn thành (backlog: ${backlogIncompleteCount}, trong sprint: ${inSprintIncompleteCount})`,
      details: {
        incompleteCount,
        backlogIncompleteCount,
        inSprintIncompleteCount,
      },
    };
  }
  return { ok: true };
}

function throwIfProjectNotCloseable(evaluation) {
  if (!evaluation || evaluation.ok) return;
  throwCloseGateError({
    errorCode: evaluation.errorCode,
    message: evaluation.message,
    details: evaluation.details,
  });
}

function isProjectClosedStatus(status) {
  return String(status || '').trim().toLowerCase() === 'closed';
}

function assertProjectWritable(project) {
  if (isProjectClosedStatus(project?.status)) {
    throwCloseGateError({
      errorCode: 'PROJECT_CLOSED',
      message: 'Dự án đã hoàn thành — không thể chỉnh sửa',
      details: { status: 'closed' },
    });
  }
}

function assertProjectNotAlreadyClosed(project) {
  if (isProjectClosedStatus(project?.status)) {
    throwCloseGateError({
      errorCode: 'ALREADY_CLOSED',
      message: 'Dự án đã hoàn thành',
      details: { status: 'closed' },
    });
  }
}

function assertMustCompleteBeforeArchive(project) {
  if (!isProjectClosedStatus(project?.status)) {
    throwCloseGateError({
      errorCode: 'MUST_COMPLETE_FIRST',
      message: 'Hãy hoàn thành dự án trước khi lưu trữ',
      details: { status: String(project?.status || '') },
    });
  }
}

/** Archive sớm: org elevated hoặc project:delete; ngược lại cần status=closed. */
function canSkipCompleteGateBeforeArchive({
  isOrgAdmin = false,
  isCreator = false,
  permissions = [],
  legacyOrgAdmin = false,
} = {}) {
  if (legacyOrgAdmin || isOrgAdmin || isCreator) return true;
  const { hasPermission } = require('./projectPermissionMatrix');
  return hasPermission(permissions, 'project:delete');
}

/** PATCH project status=closed phải đi Hoàn thành dự án. */
function assertPatchDoesNotCloseProject(currentStatus, nextStatus) {
  const cur = String(currentStatus || '').toLowerCase();
  const next = String(nextStatus || '').toLowerCase();
  if (next === 'closed' && cur !== 'closed') {
    throwCloseGateError({
      errorCode: 'USE_COMPLETE_PROJECT',
      message: 'Hãy dùng Hoàn thành dự án',
      details: {},
    });
  }
}

/** PATCH status=closed trên sprint active phải đi Complete Sprint. */
function assertPatchDoesNotCloseActiveSprint(currentStatus, nextStatus) {
  const cur = String(currentStatus || '').toLowerCase();
  const next = String(nextStatus || '').toLowerCase();
  if (next === 'closed' && cur === 'active') {
    throwCloseGateError({
      errorCode: 'USE_COMPLETE_SPRINT',
      message: 'Sprint đang chạy hãy dùng Hoàn thành Sprint',
    });
  }
}

module.exports = {
  asStringOid,
  hasSprintId,
  isLastOpenSprint,
  countOpenSprints,
  classifyProjectIncompleteWork,
  evaluateProjectCloseGate,
  throwIfProjectNotCloseable,
  throwCloseGateError,
  isProjectClosedStatus,
  assertProjectWritable,
  assertProjectNotAlreadyClosed,
  assertMustCompleteBeforeArchive,
  canSkipCompleteGateBeforeArchive,
  assertPatchDoesNotCloseProject,
  assertPatchDoesNotCloseActiveSprint,
};
