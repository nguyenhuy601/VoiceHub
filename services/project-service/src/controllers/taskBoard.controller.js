const mongoose = require('../db');
const { logger } = require('@enterprise/shared');
const boardService = require('../services/taskBoard.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function validOid(id) {
  return mongoose.isValidObjectId(String(id || ''));
}

function sendError(res, err, fallbackStatus, fallbackMessage, fallbackCode) {
  return sendErrorFromCatch(res, err, fallbackStatus, fallbackMessage, fallbackCode || 'TASK_BOARD_INTERNAL_ERROR');
}

function boardUnauthorized(res) {
  return sendServiceError(res, 401, {
    errorCode: 'AUTH_NO_TOKEN',
    messageUser: 'Vui lòng đăng nhập lại.',
    message: 'Unauthorized',
  });
}

function boardValidation(res, message, errorCode = 'VALIDATION_INVALID_ID') {
  const msg = String(message || 'Dữ liệu không hợp lệ.').trim();
  return sendServiceError(res, 400, { errorCode, messageUser: msg, message: msg });
}

function sendHoursSoftWarning(res, err) {
  return sendServiceError(res, 409, {
    errorCode: 'HOURS_SOFT_WARNING',
    messageUser: err.messageUser || err.message || 'HOURS_SOFT_WARNING',
    message: err.message || 'HOURS_SOFT_WARNING',
    extra: {
      daily: err.daily || [],
      weekly: err.weekly || [],
      assigneeId: err.assigneeId || null,
    },
  });
}

class TaskBoardController {
  async createBoard(req, res) {
    return sendServiceError(res, 410, {
      errorCode: 'PROJECT_CREATE_VIA_BOARD_GONE',
      messageUser: 'Tạo dự án qua POST /api/projects. Endpoint createBoard-as-project đã ngừng.',
      message: 'Gone — use POST /api/projects',
    });
  }

  async listBoards(req, res) {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, message: 'Database unavailable' });
      }
      const userId = asUserId(req);
      const { organizationId, teamId, scopeType, scopeId } = req.query || {};
      if (!userId) return boardUnauthorized(res);
      if (!validOid(organizationId)) {
        return boardValidation(res, 'organizationId không hợp lệ');
      }
      if (teamId && !validOid(teamId)) {
        return res.status(400).json({ success: false, message: 'teamId không hợp lệ' });
      }
      if (scopeId && !validOid(scopeId)) {
        return res.status(400).json({ success: false, message: 'scopeId không hợp lệ' });
      }
      const boards = await boardService.listBoards({ userId, organizationId, teamId, scopeType, scopeId });
      return res.json({ success: true, data: boards });
    } catch (err) {
      logger.error('[task-board] listBoards failed: %s', err?.message || err);
      const status = err?.name === 'CastError' ? 400 : 500;
      return sendError(res, err, status, 'Không thể tải danh sách board', 'TASK_BOARD_LIST_FAILED');
    }
  }

  async getBoardDetail(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId } = req.params;
      if (!userId) return boardUnauthorized(res);
      if (!validOid(boardId)) return boardValidation(res, 'boardId không hợp lệ');
      const data = await boardService.getBoardDetail({ userId, boardId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 403, 'Không thể tải chi tiết board', 'TASK_BOARD_DETAIL_FAILED');
    }
  }

  async listAssignableMembers(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId } = req.params;
      if (!userId) return boardUnauthorized(res);
      if (!validOid(boardId)) return boardValidation(res, 'boardId không hợp lệ');
      const data = await boardService.listBoardAssignableMembers({
        userId,
        boardId,
        evaluateCanAssign:
          req.query?.evaluateCanAssign === '1' ||
          req.query?.evaluateCanAssign === 'true',
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 403, 'Không thể tải danh sách thành viên', 'TASK_BOARD_MEMBERS_FAILED');
    }
  }

  async createList(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId } = req.params;
      const { title } = req.body || {};
      if (!userId) return boardUnauthorized(res);
      if (!validOid(boardId)) return boardValidation(res, 'boardId không hợp lệ');
      if (!String(title || '').trim()) {
        return boardValidation(res, 'title là bắt buộc', 'VALIDATION_REQUIRED');
      }
      const data = await boardService.createList({ userId, boardId, title });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể tạo danh sách', 'TASK_BOARD_LIST_CREATE_FAILED');
    }
  }

  async createCard(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId } = req.params;
      const { listId, title } = req.body || {};
      if (!userId) return boardUnauthorized(res);
      if (!validOid(boardId) || !validOid(listId)) {
        return res.status(400).json({ success: false, message: 'boardId/listId không hợp lệ' });
      }
      if (!String(title || '').trim()) {
        return boardValidation(res, 'title là bắt buộc', 'VALIDATION_REQUIRED');
      }
      const data = await boardService.createCard({ userId, boardId, ...req.body });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      if (err?.errorCode === 'HOURS_SOFT_WARNING') return sendHoursSoftWarning(res, err);
      return sendError(res, err, 400, 'Không thể tạo card', 'TASK_BOARD_CARD_CREATE_FAILED');
    }
  }

  async moveCard(req, res) {
    try {
      const userId = asUserId(req);
      const { cardId } = req.params;
      const { toListId, position, index, ownerTeamId } = req.body || {};
      if (!userId) return boardUnauthorized(res);
      if (!validOid(cardId) || !validOid(toListId)) {
        return res.status(400).json({ success: false, message: 'cardId/toListId không hợp lệ' });
      }
      const data = await boardService.moveCard({
        userId,
        cardId,
        toListId,
        position,
        index,
        ownerTeamId,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể di chuyển card', 'TASK_BOARD_CARD_MOVE_FAILED');
    }
  }

  async copyCard(req, res) {
    try {
      const userId = asUserId(req);
      const { cardId } = req.params;
      const { toListId } = req.body || {};
      if (!userId) return boardUnauthorized(res);
      if (!validOid(cardId)) return res.status(400).json({ success: false, message: 'cardId không hợp lệ' });
      if (toListId && !validOid(toListId)) {
        return res.status(400).json({ success: false, message: 'toListId không hợp lệ' });
      }
      const data = await boardService.copyCard({ userId, cardId, toListId });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể sao chép card', 'TASK_BOARD_CARD_COPY_FAILED');
    }
  }

  async archiveCard(req, res) {
    try {
      const userId = asUserId(req);
      const { cardId } = req.params;
      if (!userId) return boardUnauthorized(res);
      if (!validOid(cardId)) return res.status(400).json({ success: false, message: 'cardId không hợp lệ' });
      const data = await boardService.archiveCard({ userId, cardId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể lưu trữ card', 'TASK_BOARD_CARD_ARCHIVE_FAILED');
    }
  }

  async reorderList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId, boardId: boardIdParam } = req.params;
      const { boardId: boardIdBody, position } = req.body || {};
      const boardId = boardIdParam || boardIdBody;
      if (!userId) return boardUnauthorized(res);
      if (!validOid(listId) || !validOid(boardId)) {
        return res.status(400).json({ success: false, message: 'listId/boardId không hợp lệ' });
      }
      const lists = await boardService.reorderList({ userId, boardId, listId, position });
      return res.json({ success: true, data: lists });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể sắp xếp danh sách', 'TASK_BOARD_LIST_REORDER_FAILED');
    }
  }

  async copyList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId } = req.params;
      const { title, toBoardId } = req.body || {};
      if (!userId) return boardUnauthorized(res);
      if (!validOid(listId)) return res.status(400).json({ success: false, message: 'listId không hợp lệ' });
      if (toBoardId && !validOid(toBoardId)) {
        return res.status(400).json({ success: false, message: 'toBoardId không hợp lệ' });
      }
      const data = await boardService.copyList({ userId, listId, title, toBoardId });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể sao chép danh sách', 'TASK_BOARD_LIST_COPY_FAILED');
    }
  }

  async moveList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId } = req.params;
      const { toBoardId, position } = req.body || {};
      if (!userId) return boardUnauthorized(res);
      if (!validOid(listId) || !validOid(toBoardId)) {
        return res.status(400).json({ success: false, message: 'listId/toBoardId không hợp lệ' });
      }
      const data = await boardService.moveList({ userId, listId, toBoardId, position });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể di chuyển danh sách', 'TASK_BOARD_LIST_MOVE_FAILED');
    }
  }

  async moveAllCardsInList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId } = req.params;
      const { toListId } = req.body || {};
      if (!userId) return boardUnauthorized(res);
      if (!validOid(listId) || !validOid(toListId)) {
        return res.status(400).json({ success: false, message: 'listId/toListId không hợp lệ' });
      }
      const data = await boardService.moveAllCardsInList({ userId, listId, toListId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể di chuyển toàn bộ card', 'TASK_BOARD_LIST_MOVE_ALL_FAILED');
    }
  }

  async watchList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId } = req.params;
      if (!userId) return boardUnauthorized(res);
      if (!validOid(listId)) return res.status(400).json({ success: false, message: 'listId không hợp lệ' });
      const data = await boardService.setListWatch({ userId, listId, watching: true });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể theo dõi danh sách', 'TASK_BOARD_LIST_WATCH_FAILED');
    }
  }

  async unwatchList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId } = req.params;
      if (!userId) return boardUnauthorized(res);
      if (!validOid(listId)) return res.status(400).json({ success: false, message: 'listId không hợp lệ' });
      const data = await boardService.setListWatch({ userId, listId, watching: false });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể hủy theo dõi danh sách', 'TASK_BOARD_LIST_UNWATCH_FAILED');
    }
  }

  async archiveList(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId, listId } = req.params;
      if (!userId) return boardUnauthorized(res);
      if (!validOid(boardId) || !validOid(listId)) {
        return res.status(400).json({ success: false, message: 'boardId/listId không hợp lệ' });
      }
      const data = await boardService.archiveList({ userId, boardId, listId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể lưu trữ danh sách', 'TASK_BOARD_LIST_ARCHIVE_FAILED');
    }
  }

  async archiveBoard(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId } = req.params;
      if (!userId) return boardUnauthorized(res);
      if (!validOid(boardId)) {
        return res.status(400).json({ success: false, message: 'boardId không hợp lệ' });
      }
      const data = await boardService.archiveBoard({ userId, boardId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể đóng dự án', 'TASK_BOARD_ARCHIVE_FAILED');
    }
  }

  async patchBoard(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId } = req.params;
      if (!userId) return boardUnauthorized(res);
      if (!validOid(boardId)) {
        return res.status(400).json({ success: false, message: 'boardId không hợp lệ' });
      }
      const data = await boardService.patchBoard({
        userId,
        boardId,
        patch: req.body || {},
      });
      return res.json({ success: true, data });
    } catch (err) {
      const status = err.statusCode === 400 ? 400 : 403;
      return sendError(res, err, status, 'Không thể cập nhật dự án', 'TASK_BOARD_PATCH_FAILED');
    }
  }

  async updateCard(req, res) {
    try {
      const userId = asUserId(req);
      const { cardId } = req.params;
      const {
        title,
        description,
        summary,
        priority,
        dueDate,
        startDate,
        tags,
        assigneeId,
        ownerTeamId,
        attachments,
        status,
        hoursOverride,
        hoursRationale,
      } = req.body || {};
      if (!userId) return boardUnauthorized(res);
      if (!validOid(cardId)) return res.status(400).json({ success: false, message: 'cardId không hợp lệ' });
      const data = await boardService.updateCard({
        userId,
        cardId,
        title,
        description,
        summary,
        priority,
        dueDate,
        startDate,
        tags,
        assigneeId,
        ownerTeamId,
        attachments,
        status,
        hoursOverride,
        hoursRationale,
        taskType: req.body?.taskType,
        assignments: req.body?.assignments,
        checklists: req.body?.checklists,
        parentTaskId: req.body?.parentTaskId,
        epicId: req.body?.epicId,
        issueType: req.body?.issueType,
        estimateHours: req.body?.estimateHours,
      });
      return res.json({ success: true, data });
    } catch (err) {
      if (err?.errorCode === 'HOURS_SOFT_WARNING') return sendHoursSoftWarning(res, err);
      return sendError(res, err, 400, 'Không thể cập nhật card', 'TASK_BOARD_CARD_UPDATE_FAILED');
    }
  }

  async addCardComment(req, res) {
    try {
      const userId = asUserId(req);
      const { cardId } = req.params;
      const { content } = req.body || {};
      if (!userId) return boardUnauthorized(res);
      if (!validOid(cardId)) return res.status(400).json({ success: false, message: 'cardId không hợp lệ' });
      const data = await boardService.addCardComment({ userId, cardId, content });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể thêm bình luận card', 'TASK_BOARD_CARD_COMMENT_FAILED');
    }
  }
}

module.exports = new TaskBoardController();
