const mongoose = require('../db');
const svc = require('../services/effortEstimationConfig.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function orgIdOf(req) {
  return String(
    req.query.organizationId || req.body?.organizationId || req.headers['x-organization-id'] || ''
  ).trim();
}

async function getPublished(req, res) {
  try {
    const organizationId = orgIdOf(req);
    if (!mongoose.isValidObjectId(organizationId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId là bắt buộc',
        message: 'organizationId required',
      });
    }
    const data = await svc.getPublishedOrBaseline(organizationId);
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'EFFORT_CONFIG_GET_FAILED');
  }
}

async function listVersions(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        messageUser: 'Vui lòng đăng nhập lại.',
        message: 'Unauthorized',
      });
    }
    const data = await svc.listVersions({ userId, organizationId: orgIdOf(req) });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'EFFORT_CONFIG_LIST_FAILED');
  }
}

async function getDraft(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        messageUser: 'Vui lòng đăng nhập lại.',
        message: 'Unauthorized',
      });
    }
    const data = await svc.getDraft({ userId, organizationId: orgIdOf(req) });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'EFFORT_CONFIG_DRAFT_FAILED');
  }
}

async function putDraft(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        messageUser: 'Vui lòng đăng nhập lại.',
        message: 'Unauthorized',
      });
    }
    const data = await svc.updateDraft({
      userId,
      organizationId: orgIdOf(req),
      patch: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'EFFORT_CONFIG_UPDATE_FAILED');
  }
}

async function publish(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        messageUser: 'Vui lòng đăng nhập lại.',
        message: 'Unauthorized',
      });
    }
    const data = await svc.publishDraft({ userId, organizationId: orgIdOf(req) });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'EFFORT_CONFIG_PUBLISH_FAILED');
  }
}

module.exports = {
  getPublished,
  listVersions,
  getDraft,
  putDraft,
  publish,
};
