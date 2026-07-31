const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const TaskBoard = require('../models/TaskBoard');

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
    if (
      !hasPermission(resolved.permissions, permission) &&
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
  if (status !== undefined) {
    const st = String(status || '').trim();
    if (!['planned', 'active', 'closed'].includes(st)) throw new Error('status sprint không hợp lệ');
    if (st === 'closed') {
      await requireBoardAdmin(boardId, userId, { permission: 'sprint:close' });
    }
    sprint.status = st;
  }
  if (reviewNotes !== undefined) {
    sprint.reviewNotes = String(reviewNotes || '').trim().slice(0, 4000);
  }
  await sprint.save();
  return sprint.toObject();
}

/** Soft-close nếu không phải planned; planned có thể xóa hẳn. */
async function deleteSprint({ userId, boardId, sprintId }) {
  await requireBoardAdmin(boardId, userId, { permission: 'sprint:close' });
  const sprint = await Sprint.findOne({ _id: sprintId, boardId });
  if (!sprint) throw new Error('Sprint không tồn tại');
  if (sprint.status === 'planned') {
    await Sprint.deleteOne({ _id: sprintId });
    await Task.updateMany({ boardId, sprintId }, { $set: { sprintId: null } });
    return { deleted: true };
  }
  sprint.status = 'closed';
  await sprint.save();
  return sprint.toObject();
}

async function assignCardsToSprint({ userId, boardId, sprintId, cardIds }) {
  await requireBoardAdmin(boardId, userId);
  const sprint = await Sprint.findOne({ _id: sprintId, boardId }).lean();
  if (!sprint) throw new Error('Sprint không tồn tại');
  if (sprint.status === 'closed') throw new Error('Không gắn thẻ vào sprint đã đóng');
  const ids = [...new Set((cardIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) throw new Error('cardIds bắt buộc');
  const result = await Task.updateMany(
    { _id: { $in: ids }, boardId, isActive: true },
    { $set: { sprintId } }
  );
  return { matched: result.matchedCount ?? result.n, modified: result.modifiedCount ?? result.nModified };
}

async function removeCardFromSprint({ userId, boardId, sprintId, cardId }) {
  await requireBoardAdmin(boardId, userId);
  const sprint = await Sprint.findOne({ _id: sprintId, boardId }).lean();
  if (!sprint) throw new Error('Sprint không tồn tại');
  const card = await Task.findOne({ _id: cardId, boardId });
  if (!card) throw new Error('Card không tồn tại');
  if (String(card.sprintId || '') !== String(sprintId)) {
    return card.toObject();
  }
  card.sprintId = null;
  await card.save();
  return card.toObject();
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
