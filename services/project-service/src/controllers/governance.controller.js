const mongoose = require('../db');
const auditService = require('../services/audit.service');
const governanceService = require('../services/governance.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function unauthorized(res) {
  return sendServiceError(res, 401, {
    errorCode: 'AUTH_NO_TOKEN',
    messageUser: 'Vui lòng đăng nhập lại.',
    message: 'Unauthorized',
  });
}

function orgIdOf(req) {
  return String(
    req.query.organizationId || req.body?.organizationId || req.headers['x-organization-id'] || ''
  ).trim();
}

async function listAuditEvents(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = orgIdOf(req);
    if (!mongoose.isValidObjectId(organizationId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId là bắt buộc',
        message: 'organizationId required',
      });
    }
    const data = await auditService.listAuditEvents({
      userId,
      organizationId,
      resourceType: req.query.resourceType,
      resourceId: req.query.resourceId,
      action: req.query.action,
      limit: req.query.limit,
      before: req.query.before,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'AUDIT_LIST_FAILED');
  }
}

async function deleteAuditEvent(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    await auditService.denyDeleteAudit();
    return res.status(403).json({ success: false, message: 'Forbidden' });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 403, err.message, 'AUDIT_APPEND_ONLY');
  }
}

async function directorHealth(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = orgIdOf(req);
    if (!mongoose.isValidObjectId(organizationId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId là bắt buộc',
        message: 'organizationId required',
      });
    }
    const includeArchived =
      String(req.query.includeArchived || '').trim() === '1' ||
      String(req.query.includeArchived || '').toLowerCase() === 'true';
    const data = await governanceService.getDirectorHealth({
      userId,
      organizationId,
      includeArchived,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'DIRECTOR_HEALTH_FAILED');
  }
}

async function getRetention(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = orgIdOf(req);
    if (!mongoose.isValidObjectId(organizationId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId là bắt buộc',
        message: 'organizationId required',
      });
    }
    const data = await governanceService.getRetentionPolicy({ userId, organizationId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'RETENTION_GET_FAILED');
  }
}

async function putRetention(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = orgIdOf(req);
    if (!mongoose.isValidObjectId(organizationId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId là bắt buộc',
        message: 'organizationId required',
      });
    }
    const data = await governanceService.updateRetentionPolicy({
      userId,
      organizationId,
      patch: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'RETENTION_PUT_FAILED');
  }
}

async function runRetentionStub(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = orgIdOf(req);
    if (!mongoose.isValidObjectId(organizationId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId là bắt buộc',
        message: 'organizationId required',
      });
    }
    const dryRun = req.body?.dryRun !== false;
    const data = await governanceService.runRetentionStub({
      userId,
      organizationId,
      dryRun,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'RETENTION_STUB_FAILED');
  }
}

async function securityFlags(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    return res.json({ success: true, data: governanceService.getSecurityFeatureFlagsStub() });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'SECURITY_FLAGS_FAILED');
  }
}

module.exports = {
  listAuditEvents,
  deleteAuditEvent,
  directorHealth,
  getRetention,
  putRetention,
  runRetentionStub,
  securityFlags,
};
