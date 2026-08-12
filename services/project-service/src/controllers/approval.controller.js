const mongoose = require('../db');
const approvalService = require('../services/approval.service');
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

async function listPolicies(req, res) {
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
    const data = await approvalService.listPolicies(organizationId, userId, {
      projectId: String(req.query.projectId || '').trim() || undefined,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'APPROVAL_POLICY_LIST_FAILED');
  }
}

async function upsertPolicy(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = orgIdOf(req);
    const body = req.body || {};
    const data = await approvalService.upsertPolicy({
      userId,
      organizationId,
      policyId: req.params.policyId || body.policyId,
      key: body.key,
      name: body.name,
      description: body.description,
      entityTypes: body.entityTypes,
      steps: body.steps,
      isActive: body.isActive,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'APPROVAL_POLICY_UPSERT_FAILED');
  }
}

async function listInbox(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const organizationId = orgIdOf(req);
    const data = await approvalService.listInbox({
      userId,
      organizationId,
      status: req.query.status || 'pending',
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'APPROVAL_INBOX_FAILED');
  }
}

async function decide(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await approvalService.decideRequest({
      userId,
      requestId: req.params.requestId,
      decision: req.body?.decision,
      comment: req.body?.comment,
      organizationId: orgIdOf(req),
      clientIp: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(),
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'APPROVAL_DECIDE_FAILED');
  }
}

async function cancel(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await approvalService.cancelRequest({
      userId,
      requestId: req.params.requestId,
      reason: req.body?.reason,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'APPROVAL_CANCEL_FAILED');
  }
}

async function listEntity(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await approvalService.listForEntity({
      entityType: req.params.entityType,
      entityId: req.params.entityId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'APPROVAL_ENTITY_LIST_FAILED');
  }
}

async function startStub(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const body = req.body || {};
    const data = await approvalService.startStubEntityApproval({
      userId,
      organizationId: orgIdOf(req) || body.organizationId,
      projectId: body.projectId,
      entityType: body.entityType,
      entityId: body.entityId,
      policyKey: body.policyKey,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'APPROVAL_STUB_FAILED');
  }
}

async function bindProjectPolicy(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await approvalService.bindProjectTaskDonePolicy({
      userId,
      projectId: req.params.projectId,
      policyId: req.body?.policyId || null,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'APPROVAL_BIND_FAILED');
  }
}

module.exports = {
  listPolicies,
  upsertPolicy,
  listInbox,
  decide,
  cancel,
  listEntity,
  startStub,
  bindProjectPolicy,
};
