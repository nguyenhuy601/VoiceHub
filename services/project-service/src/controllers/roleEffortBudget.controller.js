const mongoose = require('../db');
const {
  listTemplates,
  upsertTemplate,
  listProjectBudgets,
  patchProjectBudget,
  approveProjectBudget,
  allocateFromBudget,
  ensurePublishedTemplate,
} = require('../services/roleEffortBudget.service');
const { getUserForecastCapacity } = require('../services/forecastCapacity.service');
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

async function listOrgTemplates(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = String(
      req.query.organizationId || req.params.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    if (!mongoose.isValidObjectId(organizationId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId là bắt buộc',
        message: 'organizationId required',
      });
    }
    await ensurePublishedTemplate(organizationId, userId);
    const data = await listTemplates(organizationId);
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải Role Effort Budget templates',
      'ROLE_BUDGET_TEMPLATE_LIST_FAILED'
    );
  }
}

async function putOrgTemplate(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = String(
      req.body?.organizationId ||
        req.params.organizationId ||
        req.headers['x-organization-id'] ||
        ''
    ).trim();
    const data = await upsertTemplate({
      organizationId,
      actorUserId: userId,
      title: req.body?.title,
      lines: req.body?.lines,
      publish: req.body?.publish === true,
      version: req.body?.version,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể lưu Role Effort Budget template',
      'ROLE_BUDGET_TEMPLATE_UPSERT_FAILED'
    );
  }
}

async function listProjectRoleBudgets(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const projectId = String(req.params.projectId || '').trim();
    const data = await listProjectBudgets(projectId, {
      status: req.query.status || null,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải Role Effort Budget',
      'ROLE_BUDGET_LIST_FAILED'
    );
  }
}

async function patchBudget(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await patchProjectBudget({
      projectId: req.params.projectId,
      budgetId: req.params.budgetId,
      actorUserId: userId,
      hoursPerWeek: req.body?.hoursPerWeek,
      activityLabel: req.body?.activityLabel,
      spreadPolicy: req.body?.spreadPolicy,
      phaseStartDate: req.body?.phaseStartDate,
      phaseEndDate: req.body?.phaseEndDate,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể cập nhật Role Effort Budget',
      'ROLE_BUDGET_PATCH_FAILED'
    );
  }
}

async function approveBudget(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await approveProjectBudget({
      projectId: req.params.projectId,
      budgetId: req.params.budgetId,
      actorUserId: userId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể phê duyệt Role Effort Budget',
      'ROLE_BUDGET_APPROVE_FAILED'
    );
  }
}

async function allocateBudget(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await allocateFromBudget({
      projectId: req.params.projectId,
      budgetId: req.params.budgetId,
      actorUserId: userId,
      hours: req.body?.hours,
      targetType: req.body?.targetType,
      targetId: req.body?.targetId,
      weekKey: req.body?.weekKey,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể allocate từ Role Effort Budget',
      'ROLE_BUDGET_ALLOCATE_FAILED'
    );
  }
}

async function getForecastCapacity(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = String(
      req.query.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    const targetUserId = String(req.query.userId || req.params.userId || '').trim();
    if (!mongoose.isValidObjectId(organizationId) || !mongoose.isValidObjectId(targetUserId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'organizationId và userId là bắt buộc',
        message: 'organizationId and userId required',
      });
    }
    const data = await getUserForecastCapacity({
      organizationId,
      userId: targetUserId,
      weekKey: req.query.weekKey || null,
      projectId: req.query.projectId || req.params.projectId || null,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải forecast capacity',
      'FORECAST_CAPACITY_FAILED'
    );
  }
}

module.exports = {
  listOrgTemplates,
  putOrgTemplate,
  listProjectRoleBudgets,
  patchBudget,
  approveBudget,
  allocateBudget,
  getForecastCapacity,
};
