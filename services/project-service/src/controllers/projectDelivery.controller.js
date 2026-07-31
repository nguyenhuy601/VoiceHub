const {
  ensureOrgProjectRoles,
  listProjectMemberships,
  setUserProjectRoles,
  migrateBoardMembersToProjectRoles,
} = require('../services/projectTeam.service');
const {
  listEdges,
  upsertEdge,
  deleteEdge,
  applyDelegationTemplate,
  listDelegationTemplates,
} = require('../services/delegation.service');
const { assertCanAssign } = require('../services/assignmentEngine.service');
const boardService = require('../services/taskBoard.service');
const TaskBoard = require('../models/TaskBoard');
const ProjectRole = require('../models/ProjectRole');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

async function requireBoardAdmin(boardId, userId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board) {
    const err = new Error('Board không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const ok = await boardService.userCanAdminBoard(userId, board);
  if (!ok) {
    const err = new Error('Chỉ admin board mới quản lý Project Team / Delegation');
    err.statusCode = 403;
    throw err;
  }
  return board;
}

async function listRoles(req, res) {
  try {
    const userId = asUserId(req);
    const { boardId } = req.params;
    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        messageUser: 'Vui lòng đăng nhập lại.',
        message: 'Unauthorized',
      });
    }
    const board = await boardService.ensureBoardViewAccess(boardId, userId);
    if (!board) {
      return sendServiceError(res, 403, {
        errorCode: 'TASK_BOARD_FORBIDDEN',
        messageUser: 'Không có quyền xem board.',
        message: 'Forbidden',
      });
    }
    const roles = await ensureOrgProjectRoles(board.organizationId);
    return res.json({ success: true, data: roles });
  } catch (err) {
    return sendErrorFromCatch(res, err, 400, err.message, 'PROJECT_ROLE_LIST_FAILED');
  }
}

async function listMembers(req, res) {
  try {
    const userId = asUserId(req);
    const { boardId } = req.params;
    const board = await boardService.ensureBoardViewAccess(boardId, userId);
    if (!board) {
      return sendServiceError(res, 403, {
        errorCode: 'TASK_BOARD_FORBIDDEN',
        messageUser: 'Không có quyền xem board.',
        message: 'Forbidden',
      });
    }
    await migrateBoardMembersToProjectRoles(boardId, userId);
    const members = await listProjectMemberships(boardId);
    return res.json({ success: true, data: members });
  } catch (err) {
    return sendErrorFromCatch(res, err, 400, err.message, 'PROJECT_MEMBER_LIST_FAILED');
  }
}

async function putMemberRoles(req, res) {
  try {
    const userId = asUserId(req);
    const { boardId, memberUserId } = req.params;
    const { projectRoleKeys } = req.body || {};
    await requireBoardAdmin(boardId, userId);
    const roles = await setUserProjectRoles({
      boardId,
      userId: memberUserId,
      projectRoleKeys,
      addedBy: userId,
    });
    return res.json({ success: true, data: roles });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'PROJECT_MEMBER_UPDATE_FAILED');
  }
}

async function listDelegation(req, res) {
  try {
    const userId = asUserId(req);
    const { boardId } = req.params;
    const board = await boardService.ensureBoardViewAccess(boardId, userId);
    if (!board) {
      return sendServiceError(res, 403, {
        errorCode: 'TASK_BOARD_FORBIDDEN',
        messageUser: 'Không có quyền xem board.',
        message: 'Forbidden',
      });
    }
    const [edges, templates] = await Promise.all([
      listEdges(boardId),
      Promise.resolve(listDelegationTemplates()),
    ]);
    return res.json({ success: true, data: { edges, templates } });
  } catch (err) {
    return sendErrorFromCatch(res, err, 400, err.message, 'DELEGATION_LIST_FAILED');
  }
}

async function putDelegationEdge(req, res) {
  try {
    const userId = asUserId(req);
    const { boardId } = req.params;
    const { fromRoleId, toRoleId, fromRoleKey, toRoleKey, taskTypes } = req.body || {};
    const board = await requireBoardAdmin(boardId, userId);
    let fromId = fromRoleId;
    let toId = toRoleId;
    if ((!fromId || !toId) && (fromRoleKey || toRoleKey)) {
      await ensureOrgProjectRoles(board.organizationId);
      if (fromRoleKey) {
        const r = await ProjectRole.findOne({
          organizationId: board.organizationId,
          key: fromRoleKey,
        }).lean();
        fromId = r?._id;
      }
      if (toRoleKey) {
        const r = await ProjectRole.findOne({
          organizationId: board.organizationId,
          key: toRoleKey,
        }).lean();
        toId = r?._id;
      }
    }
    if (!fromId || !toId) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'fromRoleId/toRoleId (hoặc key) bắt buộc.',
        message: 'Missing roles',
      });
    }
    const edge = await upsertEdge({
      boardId,
      organizationId: board.organizationId,
      fromRoleId: fromId,
      toRoleId: toId,
      taskTypes,
    });
    return res.json({ success: true, data: edge });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'DELEGATION_UPSERT_FAILED');
  }
}

async function removeDelegationEdge(req, res) {
  try {
    const userId = asUserId(req);
    const { boardId, edgeId } = req.params;
    await requireBoardAdmin(boardId, userId);
    await deleteEdge(boardId, edgeId);
    return res.json({ success: true });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'DELEGATION_DELETE_FAILED');
  }
}

async function postApplyTemplate(req, res) {
  try {
    const userId = asUserId(req);
    const { boardId } = req.params;
    const templateId = req.body?.templateId || 'product';
    await requireBoardAdmin(boardId, userId);
    const result = await applyDelegationTemplate(boardId, templateId);
    return res.json({ success: true, data: result });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'DELEGATION_TEMPLATE_FAILED');
  }
}

async function evaluateAssign(req, res) {
  try {
    const userId = asUserId(req);
    const { boardId } = req.params;
    const { targetUserId, taskType, slot } = req.body || {};
    const board = await boardService.ensureBoardViewAccess(boardId, userId);
    if (!board) {
      return sendServiceError(res, 403, {
        errorCode: 'TASK_BOARD_FORBIDDEN',
        messageUser: 'Không có quyền.',
        message: 'Forbidden',
      });
    }
    const scope = await require('../services/taskWorkspaceScope').fetchTaskWorkspaceScope(
      userId,
      board.organizationId
    );
    const result = await assertCanAssign({
      actorUserId: userId,
      targetUserId,
      boardId,
      taskType,
      slot,
      systemMembershipRole: scope?.membershipRole,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return sendErrorFromCatch(res, err, 400, err.message, 'ASSIGN_EVALUATE_FAILED');
  }
}

module.exports = {
  listRoles,
  listMembers,
  putMemberRoles,
  listDelegation,
  putDelegationEdge,
  removeDelegationEdge,
  postApplyTemplate,
  evaluateAssign,
};
