const TaskBoard = require('../models/TaskBoard');
const TaskBoardMember = require('../models/TaskBoardMember');
const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
const {
  ensureProjectMembership,
  listUserProjectRolesOnBoard,
  setUserProjectRoles,
} = require('./projectTeam.service');
const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');
const { logger } = require('@enterprise/shared');

async function assertCanTransfer(userId, board) {
  if (String(board.createdBy) === String(userId)) return true;
  const member = await TaskBoardMember.findOne({ boardId: board._id, userId })
    .select('role')
    .lean();
  if (member?.role === 'owner') return true;
  const scope = await fetchTaskWorkspaceScope(userId, board.organizationId);
  const role = String(scope?.membershipRole || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

/**
 * Chuyển ownership board + Project Role PM.
 */
async function transferBoardOwner({ userId, boardId, toUserId, demotePreviousPm = true }) {
  const toId = String(toUserId || '').trim();
  if (!toId) throw new Error('toUserId bắt buộc');

  const board = await TaskBoard.findById(boardId);
  if (!board || board.isActive === false) throw new Error('Board không tồn tại');

  const allowed = await assertCanTransfer(userId, board);
  if (!allowed) {
    const err = new Error('Không có quyền chuyển ownership board này');
    err.statusCode = 403;
    throw err;
  }

  const prevOwnerId = String(board.createdBy);
  if (prevOwnerId === toId) {
    return board.toObject();
  }

  board.createdBy = toId;
  await board.save();

  await TaskBoardMember.findOneAndUpdate(
    { boardId: board._id, userId: toId },
    {
      $set: { role: 'owner', canView: true, canEdit: true },
      $setOnInsert: { addedBy: userId },
    },
    { upsert: true }
  );

  await ensureProjectMembership({
    boardId: board._id,
    userId: toId,
    projectRoleKey: DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER,
    addedBy: userId,
  });

  if (demotePreviousPm && prevOwnerId) {
    const prevRoles = await listUserProjectRolesOnBoard(board._id, prevOwnerId);
    const keys = prevRoles
      .map((r) => r.key)
      .filter((k) => k && k !== DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER);
    if (!keys.includes(DEFAULT_PROJECT_ROLE_KEYS.DEVELOPER)) {
      keys.push(DEFAULT_PROJECT_ROLE_KEYS.DEVELOPER);
    }
    await setUserProjectRoles({
      boardId: board._id,
      userId: prevOwnerId,
      projectRoleKeys: keys.length ? keys : [DEFAULT_PROJECT_ROLE_KEYS.DEVELOPER],
      addedBy: userId,
    });
    await TaskBoardMember.updateOne(
      { boardId: board._id, userId: prevOwnerId },
      { $set: { role: 'editor', canView: true, canEdit: true } }
    );
  }

  logger.info(
    '[board-transfer] board=%s from=%s to=%s by=%s',
    String(board._id),
    prevOwnerId,
    toId,
    String(userId)
  );

  return {
    board: board.toObject(),
    previousOwnerId: prevOwnerId,
    newOwnerId: toId,
  };
}

module.exports = {
  transferBoardOwner,
  assertCanTransfer,
};
