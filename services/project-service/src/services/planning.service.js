const mongoose = require('../db');
const PlanningItem = require('../models/PlanningItem');
const {
  PLANNING_ITEM_TYPES,
  normalizePlanningStatus,
  normalizePlanningPriority,
} = require('../utils/planningItemTypes');
const Task = require('../models/Task');
const projectService = require('./project.service');
const { assertUserProjectPermission, assertUserAnyProjectPermission } = require('./projectAccess.service');
const { assertProjectWritable } = require('../utils/projectCloseGate');
const { isProjectRbacV2Enabled } = require('../utils/projectPermissionMatrix');
const { planningWritePermission } = require('../utils/projectIssueTypePerms');
const { buildPlanningListFilter } = require('../utils/listLazyQuery');
const { enrichAssignableProfiles } = require('../utils/userProfileLabels');

function validOid(id) {
  return mongoose.isValidObjectId(String(id || ''));
}

async function assertProjectAccess(userId, projectId) {
  return projectService.getProject({ userId, projectId });
}

async function assertPlanningManage(userId, projectId, { type, action } = {}) {
  await assertProjectAccess(userId, projectId);
  if (!isProjectRbacV2Enabled()) {
    const project = await projectService.getProject({ userId, projectId });
    const canAdmin = await projectService.userCanAdminProject(userId, project);
    if (!canAdmin) {
      const err = new Error('Không có quyền quản lý planning');
      err.statusCode = 403;
      throw err;
    }
    assertProjectWritable(project);
    return project;
  }
  const permission = planningWritePermission(type, action || 'update');
  await assertUserProjectPermission({
    userId,
    projectId,
    permission,
    message: `Không có quyền quản lý planning (${permission})`,
  });
  const project = await projectService.getProject({ userId, projectId });
  assertProjectWritable(project);
  return project;
}

async function assertPlanningPrioritizeOrWrite(userId, projectId, type) {
  await assertProjectAccess(userId, projectId);
  if (!isProjectRbacV2Enabled()) {
    return assertPlanningManage(userId, projectId, { type, action: 'update' });
  }
  const writeKey = planningWritePermission(type, 'update');
  await assertUserAnyProjectPermission({
    userId,
    projectId,
    permissions: ['backlog:prioritize', writeKey],
    message: `Không có quyền sắp xếp backlog (${writeKey} / backlog:prioritize)`,
  });
  const project = await projectService.getProject({ userId, projectId });
  assertProjectWritable(project);
  return project;
}

/** @deprecated use assertPlanningManage */
async function assertProjectAdmin(userId, projectId) {
  return assertPlanningManage(userId, projectId);
}

function normalizeType(raw) {
  const t = String(raw || '').trim().toLowerCase();
  return PLANNING_ITEM_TYPES.includes(t) ? t : null;
}

function profileLabel(profile) {
  if (!profile) return { name: '', avatar: '' };
  return {
    name: profile.displayName || profile.username || '',
    avatar: profile.avatar || '',
  };
}

async function profileMapForRows(rows, userId) {
  const ids = [
    ...new Set(
      (rows || [])
        .flatMap((r) => [r?.createdBy, r?.assigneeId])
        .map((id) => String(id || ''))
        .filter(Boolean)
    ),
  ];
  if (!ids.length) return new Map();
  try {
    const profiles = await enrichAssignableProfiles(ids, userId);
    return new Map((profiles || []).map((row) => [String(row.userId), row]));
  } catch {
    return new Map();
  }
}

function withActorLabels(row, profileMap) {
  const creator = row.createdBy ? profileMap.get(String(row.createdBy)) : null;
  const assignee = row.assigneeId ? profileMap.get(String(row.assigneeId)) : null;
  const assigneeMeta = profileLabel(assignee);
  return {
    ...row,
    createdByName: profileLabel(creator).name,
    createdByAvatar: profileLabel(creator).avatar,
    assigneeName: assigneeMeta.name,
    assigneeAvatar: assigneeMeta.avatar,
  };
}

function parseAssigneeId(raw) {
  if (raw === null || raw === '') return null;
  if (!validOid(raw)) {
    const err = new Error('assigneeId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  return raw;
}

async function listPlanningItems({ userId, projectId, type, parentId }) {
  await assertProjectAccess(userId, projectId);
  if (isProjectRbacV2Enabled()) {
    await assertUserProjectPermission({
      userId,
      projectId,
      permission: 'backlog:view',
      message: 'Không có quyền xem planning (backlog:view)',
    });
  }
  const filter = buildPlanningListFilter(
    { projectId, type, parentId },
    { isValidOid: validOid }
  );
  const rows = await PlanningItem.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
  const profileMap = await profileMapForRows(rows, userId);
  return rows.map((row) => withActorLabels(row, profileMap));
}

async function createPlanningItem({
  userId,
  projectId,
  type,
  title,
  description,
  parentId,
  targetDate,
  status,
  sortOrder,
  assigneeId,
  priority,
  startDate,
  dueDate,
}) {
  const itemType = normalizeType(type);
  if (!itemType) {
    const err = new Error('type bắt buộc (roadmap|release|milestone|epic|feature)');
    err.statusCode = 400;
    throw err;
  }
  const project = await assertPlanningManage(userId, projectId, { type: itemType, action: 'create' });
  const name = String(title || '').trim();
  if (!name) {
    const err = new Error('title là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  let parentOid = null;
  if (parentId) {
    if (!validOid(parentId)) {
      const err = new Error('parentId không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    const parent = await PlanningItem.findOne({
      _id: parentId,
      projectId,
      isActive: true,
    }).lean();
    if (!parent) {
      const err = new Error('parentId không tồn tại trong project');
      err.statusCode = 400;
      throw err;
    }
    parentOid = parent._id;
    const { assertPlanningParentNest } = require('./workTypeNest.service');
    await assertPlanningParentNest({
      projectId,
      childType: itemType,
      parentType: parent.type,
    });
  }
  const last = await PlanningItem.findOne({ projectId, type: itemType, isActive: true })
    .sort({ sortOrder: -1 })
    .lean();
  const nextOrder =
    sortOrder !== undefined && sortOrder !== null && Number.isFinite(Number(sortOrder))
      ? Number(sortOrder)
      : (Number(last?.sortOrder) || 0) + 1000;

  const row = await PlanningItem.create({
    organizationId: project.organizationId,
    projectId,
    type: itemType,
    title: name.slice(0, 240),
    description: String(description || '').trim().slice(0, 4000),
    parentId: parentOid,
    targetDate: targetDate ? new Date(targetDate) : null,
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    status: normalizePlanningStatus(status),
    assigneeId: assigneeId !== undefined ? parseAssigneeId(assigneeId) : null,
    priority: normalizePlanningPriority(priority),
    sortOrder: nextOrder,
    createdBy: userId,
  });
  const created = row.toObject();
  const { appendFieldChanges } = require('./workHistory.service');
  await appendFieldChanges({
    organizationId: project.organizationId,
    projectId,
    planningItemId: created._id,
    actorId: userId,
    changes: [{ field: 'issue', from: null, to: created.title }],
  });
  return created;
}

async function patchPlanningItem({ userId, projectId, itemId, patch = {} }) {
  const item = await PlanningItem.findOne({ _id: itemId, projectId, isActive: true });
  if (!item) {
    const err = new Error('Planning item không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const beforeDoc = item.toObject();
  const keys = Object.keys(patch || {}).filter((k) => patch[k] !== undefined);
  const prioritizeOnly = keys.length === 1 && keys[0] === 'sortOrder';
  const nextType = patch.type !== undefined ? normalizeType(patch.type) || item.type : item.type;
  if (prioritizeOnly) {
    await assertPlanningPrioritizeOrWrite(userId, projectId, nextType);
  } else {
    await assertPlanningManage(userId, projectId, { type: nextType, action: 'update' });
  }
  if (patch.title !== undefined) {
    const name = String(patch.title || '').trim();
    if (!name) throw new Error('title không hợp lệ');
    item.title = name.slice(0, 240);
  }
  if (patch.description !== undefined) {
    item.description = String(patch.description || '').trim().slice(0, 4000);
  }
  if (patch.type !== undefined) {
    const t = normalizeType(patch.type);
    if (!t) throw new Error('type không hợp lệ');
    item.type = t;
  }
  if (patch.status !== undefined) {
    item.status = normalizePlanningStatus(patch.status, item.status);
  }
  if (patch.priority !== undefined) {
    item.priority = normalizePlanningPriority(patch.priority, item.priority);
  }
  if (patch.assigneeId !== undefined) {
    item.assigneeId = parseAssigneeId(patch.assigneeId);
  }
  if (patch.targetDate !== undefined) {
    item.targetDate = patch.targetDate ? new Date(patch.targetDate) : null;
  }
  if (patch.startDate !== undefined) {
    item.startDate = patch.startDate ? new Date(patch.startDate) : null;
  }
  if (patch.dueDate !== undefined) {
    item.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
  }
  if (patch.sortOrder !== undefined && Number.isFinite(Number(patch.sortOrder))) {
    item.sortOrder = Number(patch.sortOrder);
  }
  if (patch.parentId !== undefined) {
    if (!patch.parentId) {
      item.parentId = null;
    } else {
      if (!validOid(patch.parentId)) throw new Error('parentId không hợp lệ');
      if (String(patch.parentId) === String(itemId)) {
        throw new Error('parentId không thể là chính item');
      }
      const parent = await PlanningItem.findOne({
        _id: patch.parentId,
        projectId,
        isActive: true,
      }).lean();
      if (!parent) throw new Error('parentId không tồn tại trong project');
      const { assertPlanningParentNest } = require('./workTypeNest.service');
      await assertPlanningParentNest({
        projectId,
        childType: nextType,
        parentType: parent.type,
      });
      item.parentId = parent._id;
    }
  }
  await item.save();
  const afterDoc = item.toObject();
  const { diffPlanningFields } = require('../utils/workHistoryDiff');
  const { appendFieldChanges } = require('./workHistory.service');
  await appendFieldChanges({
    organizationId: item.organizationId,
    projectId,
    planningItemId: item._id,
    actorId: userId,
    changes: diffPlanningFields(beforeDoc, afterDoc),
  });
  const profileMap = await profileMapForRows([afterDoc], userId);
  return withActorLabels(afterDoc, profileMap);
}

async function deletePlanningItem({ userId, projectId, itemId }) {
  const item = await PlanningItem.findOne({ _id: itemId, projectId, isActive: true });
  if (!item) {
    const err = new Error('Planning item không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  await assertPlanningManage(userId, projectId, { type: item.type, action: 'delete' });
  item.isActive = false;
  await item.save();
  if (item.type === 'epic') {
    await Task.updateMany(
      { projectId, epicId: item._id, isActive: true },
      { $set: { epicId: null } }
    );
  }
  await PlanningItem.updateMany(
    { projectId, parentId: item._id, isActive: true },
    { $set: { parentId: null } }
  );
  return { deleted: true, id: String(item._id) };
}

/**
 * Product backlog: active tasks in project without sprint.
 */
async function listBacklog({ userId, projectId }) {
  await assertProjectAccess(userId, projectId);
  return Task.find({
    projectId,
    isActive: true,
    $or: [{ sprintId: null }, { sprintId: { $exists: false } }],
  })
    .sort({ position: 1, createdAt: -1 })
    .limit(500)
    .lean();
}

async function linkTaskToEpic({ userId, projectId, taskId, epicId, issueType }) {
  await assertProjectAccess(userId, projectId);
  if (isProjectRbacV2Enabled()) {
    await assertUserAnyProjectPermission({
      userId,
      projectId,
      permissions: ['epic:update', 'story:update', 'backlog:update'],
      message: 'Không có quyền gắn epic (epic:update)',
    });
  } else {
    await assertPlanningManage(userId, projectId, { type: 'epic', action: 'update' });
  }
  const task = await Task.findOne({ _id: taskId, projectId, isActive: true });
  if (!task) {
    const err = new Error('Task không tồn tại trong project');
    err.statusCode = 404;
    throw err;
  }
  if (epicId) {
    if (!validOid(epicId)) {
      const err = new Error('epicId không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    const epic = await PlanningItem.findOne({
      _id: epicId,
      projectId,
      type: 'epic',
      isActive: true,
    }).lean();
    if (!epic) {
      const err = new Error('Epic không tồn tại');
      err.statusCode = 400;
      throw err;
    }
    task.epicId = epic._id;
  } else if (epicId === null || epicId === '') {
    task.epicId = null;
  }
  if (issueType !== undefined) {
    const it = String(issueType || 'task').toLowerCase();
    if (!['task', 'bug', 'story'].includes(it)) {
      const err = new Error('issueType phải là task|bug|story');
      err.statusCode = 400;
      throw err;
    }
    task.issueType = it;
  }
  await task.save();
  return task.toObject();
}

module.exports = {
  listPlanningItems,
  createPlanningItem,
  patchPlanningItem,
  deletePlanningItem,
  listBacklog,
  linkTaskToEpic,
  PLANNING_ITEM_TYPES,
};
