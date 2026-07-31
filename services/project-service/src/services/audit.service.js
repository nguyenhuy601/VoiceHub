const AuditEvent = require('../models/AuditEvent');
const {
  isProjectAuditV1Enabled,
  buildBeforeAfter,
  pickAuditFields,
  createAppendOnlyDeleteError,
} = require('../utils/auditSnapshot');
const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
const { logger } = require('@enterprise/shared');

async function requireOrgAdmin(organizationId, userId) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  const role = String(scope?.membershipRole || '').toLowerCase();
  if (role !== 'owner' && role !== 'admin') {
    const err = new Error('Chỉ org admin được xem Audit Log');
    err.statusCode = 403;
    throw err;
  }
  return scope;
}

/**
 * Append-only writer. No-op khi PROJECT_AUDIT_V1=0.
 */
async function recordAudit({
  organizationId,
  actorUserId,
  action,
  resourceType,
  resourceId,
  before = null,
  after = null,
  requestId = '',
  meta = {},
}) {
  if (!isProjectAuditV1Enabled()) return null;
  if (!organizationId || !actorUserId || !action || !resourceType || !resourceId) {
    return null;
  }
  try {
    const doc = await AuditEvent.create({
      organizationId,
      actorUserId,
      action: String(action).slice(0, 96),
      resourceType: String(resourceType).slice(0, 48),
      resourceId: String(resourceId).slice(0, 64),
      before,
      after,
      requestId: String(requestId || '').slice(0, 96),
      meta: meta && typeof meta === 'object' ? meta : {},
    });
    return doc.toObject();
  } catch (err) {
    logger.warn('[audit] record failed: %s', err.message);
    return null;
  }
}

async function recordMutationAudit({
  organizationId,
  actorUserId,
  action,
  resourceType,
  resourceId,
  beforeDoc,
  afterDoc,
  keys,
  requestId = '',
  meta = {},
}) {
  const { before, after } = buildBeforeAfter(beforeDoc, afterDoc, keys);
  return recordAudit({
    organizationId,
    actorUserId,
    action,
    resourceType,
    resourceId,
    before,
    after,
    requestId,
    meta,
  });
}

async function listAuditEvents({
  userId,
  organizationId,
  resourceType,
  resourceId,
  action,
  limit = 50,
  before,
}) {
  await requireOrgAdmin(organizationId, userId);
  const q = { organizationId };
  if (resourceType) q.resourceType = String(resourceType).trim();
  if (resourceId) q.resourceId = String(resourceId).trim();
  if (action) q.action = String(action).trim();
  if (before) {
    const d = new Date(before);
    if (!Number.isNaN(d.getTime())) q.createdAt = { $lt: d };
  }
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return AuditEvent.find(q).sort({ createdAt: -1 }).limit(lim).lean();
}

/**
 * User API không được xóa audit — luôn 403.
 */
async function denyDeleteAudit() {
  throw createAppendOnlyDeleteError();
}

module.exports = {
  recordAudit,
  recordMutationAudit,
  listAuditEvents,
  denyDeleteAudit,
  requireOrgAdmin,
  isProjectAuditV1Enabled,
  pickAuditFields,
  buildBeforeAfter,
};
