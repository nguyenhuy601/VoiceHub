const mongoose = require('../db');
const {
  getDepartmentCapacity,
  getResourcePlanner,
  getUserAllocationTimeline,
} = require('../services/resourceCapacity.service');
const { getUtilizationReport } = require('../services/utilization.service');
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

function parseDeptIds(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const s = String(raw || '').trim();
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

async function getCapacity(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = String(
      req.query.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    if (!mongoose.isValidObjectId(organizationId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId là bắt buộc',
        message: 'organizationId required',
      });
    }
    const data = await getDepartmentCapacity({
      organizationId,
      departmentIds: parseDeptIds(req.query.departmentIds),
      asOf: req.query.asOf,
      actorUserId: userId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải Department Capacity',
      'RESOURCE_CAPACITY_FAILED'
    );
  }
}

async function getPlanner(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = String(
      req.query.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    const projectId = String(req.query.projectId || req.params.projectId || '').trim();
    const departmentId = String(req.query.departmentId || '').trim();
    if (!organizationId && !projectId) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId hoặc projectId là bắt buộc',
        message: 'organizationId or projectId required',
      });
    }
    const includeOverallocated = String(req.query.includeOverallocated || '1') !== '0';
    const data = await getResourcePlanner({
      organizationId: organizationId || undefined,
      projectId: projectId || undefined,
      departmentId: departmentId || undefined,
      asOf: req.query.asOf,
      actorUserId: userId,
      includeOverallocated,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải Resource Planner',
      'RESOURCE_PLANNER_FAILED'
    );
  }
}

async function getUserAllocations(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = String(
      req.query.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    const targetUserId = String(req.params.userId || '').trim();
    if (!mongoose.isValidObjectId(organizationId) || !mongoose.isValidObjectId(targetUserId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId và userId là bắt buộc',
        message: 'organizationId and userId required',
      });
    }
    const data = await getUserAllocationTimeline({
      organizationId,
      userId: targetUserId,
      actorUserId: userId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải allocation timeline',
      'RESOURCE_USER_ALLOCATIONS_FAILED'
    );
  }
}

async function getUtilization(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = String(
      req.query.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    if (!mongoose.isValidObjectId(organizationId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId là bắt buộc',
        message: 'organizationId required',
      });
    }
    const data = await getUtilizationReport({
      organizationId,
      from: req.query.from,
      to: req.query.to,
      userId: req.query.userId,
      projectId: req.query.projectId,
      actorUserId: userId,
      hoursPerDay: req.query.hoursPerDay,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải Utilization',
      'RESOURCE_UTILIZATION_FAILED'
    );
  }
}

module.exports = {
  getCapacity,
  getPlanner,
  getUserAllocations,
  getUtilization,
};
