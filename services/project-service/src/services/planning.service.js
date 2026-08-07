const mongoose = require('../db');
const PlanningItem = require('../models/PlanningItem');
const { PLANNING_ITEM_TYPES, PLANNING_ITEM_STATUSES } = require('../utils/planningItemTypes');
const Task = require('../models/Task');
const projectService = require('./project.service');
const { assertUserProjectPermission } = require('./projectAccess.service');
const { isProjectRbacV2Enabled } = require('../utils/projectPermissionMatrix');

function validOid(id) {
  return mongoose.isValidObjectId(String(id || ''));
}

async function assertProjectAccess(userId, projectId) {
  return projectService.getProject({ userId, projectId });
}

async function assertPlanningManage(userId, projectId) {
  await assertProjectAccess(userId, projectId);
  if (!isProjectRbacV2Enabled()) {
    const project = await projectService.getProject({ userId, projectId });
    const canAdmin = await projectService.userCanAdminProject(userId, project);
    if (!canAdmin) {
      const err = new Error('Không có quyền quản lý planning');
      err.statusCode = 403;
      throw err;
    }
    return project;
  }
  await assertUserProjectPermission({
    userId,
    projectId,
    permission: 'project:edit',
    message: 'Không có quyền quản lý planning',
  });
  return projectService.getProject({ userId, projectId });
}

/** @deprecated use assertPlanningManage */
async function assertProjectAdmin(userId, projectId) {
  return assertPlanningManage(userId, projectId);
}

function normalizeType(raw) {
  const t = String(raw || '').trim().toLowerCase();
  return PLANNING_ITEM_TYPES.includes(t) ? t : null;
}

function normalizeStatus(raw, fallback = 'planned') {
  const s = String(raw || '').trim().toLowerCase();
  return PLANNING_ITEM_STATUSES.includes(s) ? s : fallback;
}

async function listPlanningItems({ userId, projectId, type }) {
  await assertProjectAccess(userId, projectId);
  const filter = { projectId, isActive: true };
  const t = type ? normalizeType(type) : null;
  if (type && !t) {
    const err = new Error('type không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  if (t) filter.type = t;
  return PlanningItem.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
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
}) {
  const project = await assertPlanningManage(userId, projectId);
  const itemType = normalizeType(type);
  if (!itemType) {
    const err = new Error('type bắt buộc (roadmap|release|milestone|epic|feature)');
    err.statusCode = 400;
    throw err;
  }
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
    status: normalizeStatus(status),
    sortOrder: nextOrder,
    createdBy: userId,
  });
  return row.toObject();
}

async function patchPlanningItem({ userId, projectId, itemId, patch = {} }) {
  await assertPlanningManage(userId, projectId);
  const item = await PlanningItem.findOne({ _id: itemId, projectId, isActive: true });
  if (!item) {
    const err = new Error('Planning item không tồn tại');
    err.statusCode = 404;
    throw err;
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
    item.status = normalizeStatus(patch.status, item.status);
  }
  if (patch.targetDate !== undefined) {
    item.targetDate = patch.targetDate ? new Date(patch.targetDate) : null;
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
      item.parentId = parent._id;
    }
  }
  await item.save();
  return item.toObject();
}

async function deletePlanningItem({ userId, projectId, itemId }) {
  await assertPlanningManage(userId, projectId);
  const item = await PlanningItem.findOne({ _id: itemId, projectId, isActive: true });
  if (!item) {
    const err = new Error('Planning item không tồn tại');
    err.statusCode = 404;
    throw err;
  }
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
  await assertPlanningManage(userId, projectId);
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
