const mongoose = require('../db');
const briefService = require('../services/projectBrief.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function validOid(id) {
  return mongoose.isValidObjectId(String(id || ''));
}

function unauthorized(res) {
  return sendServiceError(res, 401, {
    errorCode: 'AUTH_NO_TOKEN',
    messageUser: 'Vui lòng đăng nhập lại.',
    message: 'Unauthorized',
  });
}

class ProjectBriefController {
  async create(req, res) {
    try {
      const userId = asUserId(req);
      if (!userId) return unauthorized(res);
      const {
        organizationId,
        departmentId,
        title,
        body,
        projectCode,
        dueDate,
        assigneePmId,
      } = req.body || {};
      if (!validOid(organizationId) || !validOid(assigneePmId)) {
        return res.status(400).json({
          success: false,
          message: 'organizationId/assigneePmId không hợp lệ',
        });
      }
      const data = await briefService.createBrief({
        userId,
        organizationId,
        departmentId: validOid(departmentId) ? departmentId : null,
        title,
        body,
        projectCode,
        dueDate,
        assigneePmId,
      });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return sendErrorFromCatch(res, err, 400, 'Không tạo được Brief', 'PROJECT_BRIEF_CREATE_FAILED');
    }
  }

  async list(req, res) {
    try {
      const userId = asUserId(req);
      if (!userId) return unauthorized(res);
      const { organizationId, status } = req.query || {};
      if (!validOid(organizationId)) {
        return res.status(400).json({ success: false, message: 'organizationId không hợp lệ' });
      }
      const data = await briefService.listBriefs({ userId, organizationId, status });
      return res.json({ success: true, data });
    } catch (err) {
      return sendErrorFromCatch(res, err, 403, 'Không tải được Brief', 'PROJECT_BRIEF_LIST_FAILED');
    }
  }

  async getOne(req, res) {
    try {
      const userId = asUserId(req);
      if (!userId) return unauthorized(res);
      const { briefId } = req.params;
      if (!validOid(briefId)) {
        return res.status(400).json({ success: false, message: 'briefId không hợp lệ' });
      }
      const data = await briefService.getBrief({ userId, briefId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendErrorFromCatch(res, err, 403, 'Không xem được Brief', 'PROJECT_BRIEF_GET_FAILED');
    }
  }

  async accept(req, res) {
    try {
      const userId = asUserId(req);
      if (!userId) return unauthorized(res);
      const { briefId } = req.params;
      const { boardId } = req.body || {};
      if (!validOid(briefId)) {
        return res.status(400).json({ success: false, message: 'briefId không hợp lệ' });
      }
      const data = await briefService.markBriefAccepted({
        userId,
        briefId,
        boardId: validOid(boardId) ? boardId : null,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendErrorFromCatch(res, err, 400, 'Không xác nhận Brief', 'PROJECT_BRIEF_ACCEPT_FAILED');
    }
  }

  async cancel(req, res) {
    try {
      const userId = asUserId(req);
      if (!userId) return unauthorized(res);
      const { briefId } = req.params;
      if (!validOid(briefId)) {
        return res.status(400).json({ success: false, message: 'briefId không hợp lệ' });
      }
      const data = await briefService.cancelBrief({ userId, briefId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendErrorFromCatch(res, err, 400, 'Không hủy Brief', 'PROJECT_BRIEF_CANCEL_FAILED');
    }
  }
}

module.exports = new ProjectBriefController();
