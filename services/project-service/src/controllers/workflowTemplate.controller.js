const mongoose = require('../db');
const workflowService = require('../services/workflow.service');
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

async function listTemplates(req, res) {
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
    const data = await workflowService.listWorkflowTemplates(organizationId, userId, {
      projectId: String(req.query.projectId || '').trim() || undefined,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      err.message,
      'WORKFLOW_TEMPLATE_LIST_FAILED'
    );
  }
}

async function upsertTemplate(req, res) {
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
    const body = req.body || {};
    const data = await workflowService.upsertWorkflowTemplate({
      userId,
      organizationId,
      templateId: req.params.templateId || body.templateId,
      key: body.key,
      name: body.name,
      description: body.description,
      statuses: body.statuses || body.states,
      transitions: body.transitions,
      priorities: body.priorities,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      err.message,
      'WORKFLOW_TEMPLATE_UPSERT_FAILED'
    );
  }
}

async function applyToProject(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await workflowService.applyTemplateToProject({
      userId,
      projectId: req.params.projectId,
      templateId: req.body?.templateId,
      templateKey: req.body?.templateKey,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      err.message,
      'WORKFLOW_APPLY_PROJECT_FAILED'
    );
  }
}

module.exports = {
  listTemplates,
  upsertTemplate,
  applyToProject,
};
