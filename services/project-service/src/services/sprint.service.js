const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const PlanningItem = require('../models/PlanningItem');
const TaskBoard = require('../models/TaskBoard');
const { assertPatchDoesNotCloseActiveSprint } = require('../utils/projectCloseGate');

async function requireBoardAdmin(boardId, userId, { permission = 'sprint:create' } = {}) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board || board.isActive === false) {
    const err = new Error('Board không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled() && board.projectId) {
    const { resolveUserProjectPermissions } = require('./projectAccess.service');
    const resolved = await resolveUserProjectPermissions({
      userId,
      projectId: board.projectId,
      boardId,
    });
    const startFallback =
      permission === 'sprint:start' && hasPermission(resolved.permissions, 'sprint:create');
    if (
      !hasPermission(resolved.permissions, permission) &&
      !startFallback &&
      !hasPermission(resolved.permissions, 'project:edit') &&
      !resolved.isOrgAdmin &&
      !resolved.isCreator
    ) {
      const err = new Error(`Không có quyền ${permission} trên project này`);
      err.statusCode = 403;
      throw err;
    }
    return board;
  }
  const boardService = require('./taskBoard.service');
  const ok = await boardService.userCanAdminBoard(userId, board);
  if (!ok) {
    const err = new Error('Không có quyền quản trị board này');
    err.statusCode = 403;
    throw err;
  }
  return board;
}

async function listSprints(boardId, userId) {
  await requireBoardAdmin(boardId, userId, { permission: 'sprint:view' });
  return Sprint.find({ boardId }).sort({ createdAt: -1 }).lean();
}

async function createSprint({
  userId,
  boardId,
  name,
  goal,
  startDate,
  endDate,
  status,
  autoComplete,
}) {
  const board = await requireBoardAdmin(boardId, userId, { permission: 'sprint:create' });
  if (!board.projectId) {
    const err = new Error('Board thiếu projectId — tạo lại dự án qua POST /api/projects');
    err.statusCode = 400;
    throw err;
  }
  const title = String(name || '').trim();
  if (!title) throw new Error('name là bắt buộc');
  const st = ['planned', 'active', 'closed'].includes(String(status || ''))
    ? String(status)
    : 'planned';
  const row = await Sprint.create({
    organizationId: board.organizationId,
    projectId: board.projectId,
    boardId,
    name: title,
    goal: String(goal || '').trim(),
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    status: st,
    autoComplete: Boolean(autoComplete),
    createdBy: userId,
  });
  return row.toObject();
}

async function updateSprint({
  userId,
  boardId,
  sprintId,
  name,
  goal,
  startDate,
  endDate,
  status,
  reviewNotes,
  autoComplete,
}) {
  await requireBoardAdmin(boardId, userId, { permission: 'sprint:create' });
  const sprint = await Sprint.findOne({ _id: sprintId, boardId });
  if (!sprint) throw new Error('Sprint không tồn tại');
  if (name !== undefined) {
    const title = String(name || '').trim();
    if (!title) throw new Error('name không hợp lệ');
    sprint.name = title;
  }
  if (goal !== undefined) sprint.goal = String(goal || '').trim();
  if (startDate !== undefined) sprint.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) sprint.endDate = endDate ? new Date(endDate) : null;
  if (autoComplete !== undefined) {
    sprint.autoComplete = Boolean(autoComplete);
  }
  if (status !== undefined) {
    const st = String(status || '').trim();
    if (!['planned', 'active', 'closed'].includes(st)) throw new Error('status sprint không hợp lệ');
    assertPatchDoesNotCloseActiveSprint(sprint.status, st);
    if (st === 'closed') {
      await requireBoardAdmin(boardId, userId, { permission: 'sprint:close' });
    } else if (st === 'active') {
      await requireBoardAdmin(boardId, userId, { permission: 'sprint:start' });
      if (String(sprint.status || '').toLowerCase() !== 'active' && sprint.projectId) {
        const { assertNoMemberOverlapWithActiveSprints } = require('../utils/sprintMemberOverlap');
        await assertNoMemberOverlapWithActiveSprints({
          projectId: sprint.projectId,
          sprintId,
        });
      }
    }
    sprint.status = st;
  }
  if (reviewNotes !== undefined) {
    sprint.reviewNotes = String(reviewNotes || '').trim().slice(0, 4000);
  }
  await sprint.save();
  return sprint.toObject();
}

/** Chỉ xóa hẳn sprint planned; active/closed dùng Complete Sprint. */
async function deleteSprint({ userId, boardId, sprintId }) {
  await requireBoardAdmin(boardId, userId, { permission: 'sprint:delete' });
  const sprint = await Sprint.findOne({ _id: sprintId, boardId });
  if (!sprint) {
    const err = new Error('Sprint không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (String(sprint.status || '').toLowerCase() !== 'planned') {
    const err = new Error('Chỉ xóa được sprint planned. Sprint đang chạy hãy Complete Sprint.');
    err.statusCode = 409;
    err.errorCode = 'SPRINT_DELETE_NOT_PLANNED';
    throw err;
  }
  await Sprint.deleteOne({ _id: sprintId });
  await Task.updateMany({ boardId, sprintId }, { $set: { sprintId: null } });
  await PlanningItem.updateMany({ sprintId }, { $set: { sprintId: null } });
  return { deleted: true, sprintId: String(sprintId) };
}

async function assignCardsToSprint({ userId, boardId, sprintId, cardIds }) {
  await requireBoardAdmin(boardId, userId);
  const sprint = await Sprint.findOne({ _id: sprintId, boardId }).lean();
  if (!sprint) throw new Error('Sprint không tồn tại');
  if (sprint.status === 'closed') throw new Error('Không gắn thẻ vào sprint đã đóng');
  const ids = [...new Set((cardIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) throw new Error('cardIds bắt buộc');
  const taskResult = await Task.updateMany(
    { _id: { $in: ids }, boardId, isActive: true },
    { $set: { sprintId } }
  );
  const taskMatched = taskResult.matchedCount ?? taskResult.n ?? 0;
  const taskModified = taskResult.modifiedCount ?? taskResult.nModified ?? 0;
  const planResult = await PlanningItem.updateMany(
    { _id: { $in: ids }, isActive: true },
    { $set: { sprintId } }
  );
  const planMatched = planResult.matchedCount ?? planResult.n ?? 0;
  const planModified = planResult.modifiedCount ?? planResult.nModified ?? 0;
  return { matched: taskMatched + planMatched, modified: taskModified + planModified };
}

async function removeCardFromSprint({ userId, boardId, sprintId, cardId }) {
  await requireBoardAdmin(boardId, userId);
  const sprint = await Sprint.findOne({ _id: sprintId, boardId }).lean();
  if (!sprint) throw new Error('Sprint không tồn tại');
  const card = await Task.findOne({ _id: cardId, boardId });
  if (card) {
    if (String(card.sprintId || '') !== String(sprintId)) return card.toObject();
    card.sprintId = null;
    await card.save();
    return card.toObject();
  }
  const planItem = await PlanningItem.findById(cardId);
  if (!planItem) throw new Error('Card không tồn tại');
  if (String(planItem.sprintId || '') === String(sprintId)) {
    planItem.sprintId = null;
    await planItem.save();
  }
  return planItem.toObject();
}

module.exports = {
  listSprints,
  createSprint,
  updateSprint,
  deleteSprint,
  assignCardsToSprint,
  removeCardFromSprint,
  requireBoardAdmin,
};
