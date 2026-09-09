const mongoose = require('../db');
const {
  getDepartmentCapacity,
  getResourcePlanner,
  getUserAllocationTimeline,
} = require('../services/resourceCapacity.service');
const { getUtilizationReport } = require('../services/utilization.service');
const { getEmployeeResourceProfile } = require('../services/employeeResourceProfile.service');
const { listOrgResourcePool } = require('../services/orgResourcePool.service');
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

async function getOrgResourcePoolHandler(req, res) {
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
    const data = await listOrgResourcePool({
      organizationId,
      actorUserId: userId,
      asOf: req.query.asOf,
      verifiedOnly: req.query.verifiedOnly,
      departmentId: req.query.departmentId,
      limit: req.query.limit,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      requirementPackId: req.query.requirementPackId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải Employee Resource Pool',
      err.errorCode || 'ORG_RESOURCE_POOL_FAILED'
    );
  }
}

async function getEmployeeResourceProfileHandler(req, res) {
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
    const data = await getEmployeeResourceProfile({
      organizationId,
      userId: targetUserId,
      actorUserId: userId,
      asOf: req.query.asOf,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải Employee Resource Profile',
      'EMPLOYEE_RESOURCE_PROFILE_FAILED'
    );
  }
}

async function getUserPerformanceHandler(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = String(
      req.query.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    const targetUserId = String(req.params.userId || '').trim();
    const { getUserPerformance } = require('../services/userPerformance.service');
    const data = await getUserPerformance({
      organizationId,
      userId: targetUserId,
      actorUserId: userId,
      windowDays: req.query.windowDays || req.query.window || 90,
      asOf: req.query.asOf,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải Historical Performance',
      'USER_PERFORMANCE_FAILED'
    );
  }
}

async function listUserPerformanceHandler(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = String(
      req.query.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    const { listUserPerformance } = require('../services/userPerformance.service');
    const data = await listUserPerformance({
      organizationId,
      actorUserId: userId,
      windowDays: req.query.windowDays || req.query.window || 90,
      asOf: req.query.asOf,
      limit: req.query.limit,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải danh sách Historical Performance',
      'USER_PERFORMANCE_LIST_FAILED'
    );
  }
}

async function getEstimateHintsHandler(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = String(
      req.query.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    const assigneeId = String(req.query.assigneeId || '').trim();
    const { getEstimateHints } = require('../services/userPerformance.service');
    const data = await getEstimateHints({
      organizationId,
      assigneeId,
      actorUserId: userId,
      baselineHours: req.query.baselineHours,
      issueType: req.query.issueType,
      windowDays: req.query.windowDays || 90,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải estimate hints',
      'ESTIMATE_HINTS_FAILED'
    );
  }
}

module.exports = {
  getCapacity,
  getPlanner,
  getUserAllocations,
  getUtilization,
  getOrgResourcePool: getOrgResourcePoolHandler,
  getEmployeeResourceProfile: getEmployeeResourceProfileHandler,
  getUserPerformance: getUserPerformanceHandler,
  listUserPerformance: listUserPerformanceHandler,
  getEstimateHints: getEstimateHintsHandler,
};
