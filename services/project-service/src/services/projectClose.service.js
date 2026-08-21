const { logger } = require('@enterprise/shared');

const Project = require('../models/Project');
const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const TaskBoardList = require('../models/TaskBoardList');
const Worklog = require('../models/Worklog');
const ProjectMember = require('../models/ProjectMember');
const ChangeRequest = require('../models/ChangeRequest');
const PlanningItem = require('../models/PlanningItem');
const ApprovalRequest = require('../models/ApprovalRequest');
const TaskActivityLog = require('../models/TaskActivityLog');

const { buildProjectCloseSnapshot } = require('../utils/projectCloseSnapshot');
const {
  asStringOid,
  countOpenSprints,
  classifyProjectIncompleteWork,
  evaluateProjectCloseGate,
  throwIfProjectNotCloseable,
  assertProjectNotAlreadyClosed,
} = require('../utils/projectCloseGate');
const {
  persistClosedProjectExperiences,
} = require('./closedBoardExperience.service');

function normalizeCloseNotes(value) {
  return String(value || '').trim().slice(0, 4000);
}

async function getDeps(overrides = {}) {
  let assertUserAnyProjectPermission =
    typeof overrides?.assertUserAnyProjectPermission === 'function'
      ? overrides.assertUserAnyProjectPermission
      : null;
  if (!assertUserAnyProjectPermission) {
    const projectAccess = require('./projectAccess.service');
    assertUserAnyProjectPermission = projectAccess.assertUserAnyProjectPermission;
  }

  let recordAuditImpl = typeof overrides?.recordAudit === 'function' ? overrides.recordAudit : null;
  if (!recordAuditImpl) {
    const audit = require('./audit.service');
    recordAuditImpl = audit.recordAudit;
  }

  return {
    Project,
    Sprint,
    Task,
    TaskBoardList,
    Worklog,
    ProjectMember,
    ChangeRequest,
    PlanningItem,
    ApprovalRequest,
    TaskActivityLog,
    recordAudit: recordAuditImpl,
    assertUserAnyProjectPermission,
    ...(overrides || {}),
  };
}

async function assertCanCompleteProject({ userId, projectId, deps }) {
  if (typeof deps.assertUserAnyProjectPermission !== 'function') return;
  await deps.assertUserAnyProjectPermission({
    userId,
    projectId,
    permissions: ['project:archive', 'project:edit'],
    message: 'Không có quyền hoàn thành dự án (project:archive)',
  });
}

async function loadProjectOrThrow({ deps, projectId }) {
  const project = await deps.Project.findById(projectId);
  if (!project || project.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return project;
}

function leanFind(model, filter, select) {
  let q = model.find(filter);
  if (select) q = q.select(select);
  if (typeof q.lean === 'function') return q.lean();
  return q;
}

async function loadCloseInputs({ deps, projectId }) {
  const [
    sprints,
    tasks,
    worklogs,
    members,
    changeRequests,
    planningItems,
    approvals,
    activities,
  ] = await Promise.all([
    leanFind(
      deps.Sprint,
      { projectId },
      '_id name status startDate endDate closedAt closureSnapshot reviewNotes'
    ),
    leanFind(
      deps.Task,
      { projectId, isActive: { $ne: false } },
      '_id status listId sprintId issueType type estimateHours assigneeId dueDate createdAt completedAt'
    ),
    deps.Worklog
      ? leanFind(deps.Worklog, { projectId }, 'userId hours taskId')
      : Promise.resolve([]),
    deps.ProjectMember
      ? leanFind(deps.ProjectMember, { projectId }, 'userId status joinDate leaveDate billable')
      : Promise.resolve([]),
    deps.ChangeRequest
      ? leanFind(deps.ChangeRequest, { projectId, isActive: { $ne: false } }, 'status')
      : Promise.resolve([]),
    deps.PlanningItem
      ? leanFind(deps.PlanningItem, { projectId, isActive: { $ne: false } }, 'type status targetDate')
      : Promise.resolve([]),
    deps.ApprovalRequest
      ? leanFind(deps.ApprovalRequest, { projectId }, 'status createdAt completedAt')
      : Promise.resolve([]),
    deps.TaskActivityLog
      ? leanFind(deps.TaskActivityLog, { projectId, type: 'task.updated' }, 'payload type')
      : Promise.resolve(undefined),
  ]);

  const listIds = Array.from(
    new Set(
      (tasks || [])
        .map((t) => (t?.listId ? asStringOid(t.listId) : ''))
        .filter(Boolean)
    )
  );
  const lists = listIds.length
    ? await leanFind(deps.TaskBoardList, { _id: { $in: listIds } }, '_id statusKey title')
    : [];
  const listsById = {};
  for (const l of lists || []) {
    listsById[asStringOid(l._id)] = l;
  }

  return {
    sprints: sprints || [],
    tasks: tasks || [],
    listsById,
    worklogs: worklogs || [],
    members: members || [],
    changeRequests: changeRequests || [],
    planningItems: planningItems || [],
    approvals: approvals || [],
    activities: Array.isArray(activities) ? activities : undefined,
  };
}

function evaluateGateFromInputs({ sprints, tasks, listsById }) {
  const openSprintCount = countOpenSprints(sprints);
  const incomplete = classifyProjectIncompleteWork({ tasks, listsById });
  return evaluateProjectCloseGate({ openSprintCount, incomplete });
}

async function recordProjectCompleteAudit({
  deps,
  organizationId,
  actorUserId,
  projectId,
  closedAt,
}) {
  if (!deps.recordAudit) return;
  try {
    await deps.recordAudit({
      organizationId,
      actorUserId,
      action: 'project.completed',
      resourceType: 'project',
      resourceId: String(projectId),
      before: { status: 'in_development' },
      after: { status: 'closed', closedAt },
    });
  } catch (err) {
    logger.warn('[project-close] audit failed: %s', err.message);
  }
}

async function getCompleteProjectPreview({ userId, projectId, deps: depsOverrides }) {
  const deps = await getDeps(depsOverrides);
  const project = await loadProjectOrThrow({ deps, projectId });
  await assertCanCompleteProject({ userId, projectId, deps });
  assertProjectNotAlreadyClosed(project);

  const inputs = await loadCloseInputs({ deps, projectId });
  const gate = evaluateGateFromInputs(inputs);
  throwIfProjectNotCloseable(gate);

  const snapshot = buildProjectCloseSnapshot({
    project: typeof project.toObject === 'function' ? project.toObject() : project,
    closedAt: new Date(),
    closeNotes: '',
    ...inputs,
  });

  return {
    projectId: asStringOid(project._id),
    status: project.status,
    closeable: true,
    snapshot,
  };
}

async function completeProject({ userId, projectId, closeNotes, deps: depsOverrides }) {
  const deps = await getDeps(depsOverrides);
  const project = await loadProjectOrThrow({ deps, projectId });
  await assertCanCompleteProject({ userId, projectId, deps });
  assertProjectNotAlreadyClosed(project);

  const inputs = await loadCloseInputs({ deps, projectId });
  const gate = evaluateGateFromInputs(inputs);
  throwIfProjectNotCloseable(gate);

  const now = new Date();
  const notes = normalizeCloseNotes(closeNotes);
  const snapshot = buildProjectCloseSnapshot({
    project: typeof project.toObject === 'function' ? project.toObject() : project,
    closedAt: now,
    closeNotes: notes,
    ...inputs,
  });

  project.status = 'closed';
  project.closedAt = now;
  project.closedBy = userId || null;
  project.closureSnapshot = snapshot;
  await project.save();

  await recordProjectCompleteAudit({
    deps,
    organizationId: project.organizationId,
    actorUserId: userId,
    projectId: project._id,
    closedAt: now,
  });

  try {
    const persistFn =
      typeof deps.persistClosedProjectExperiences === 'function'
        ? deps.persistClosedProjectExperiences
        : persistClosedProjectExperiences;
    await persistFn({
      project: typeof project.toObject === 'function' ? project.toObject() : project,
      closedAt: now,
      deps,
    });
  } catch (err) {
    logger.warn('[project-close] closed-board persist failed: %s', err.message);
  }

  const out = typeof project.toObject === 'function' ? project.toObject() : project;
  return {
    project: {
      ...out,
      isActive: out.isActive !== false,
    },
    snapshot,
  };
}

module.exports = {
  getCompleteProjectPreview,
  completeProject,
  normalizeCloseNotes,
};
