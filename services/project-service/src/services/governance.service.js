const mongoose = require('../db');
const Project = require('../models/Project');
const GovernanceSettings = require('../models/GovernanceSettings');
const { aggregateDirectorHealth } = require('../utils/directorHealth');
const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
const auditService = require('./audit.service');
const { logger } = require('@enterprise/shared');

async function requireOrgAdmin(organizationId, userId) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  const role = String(scope?.membershipRole || '').toLowerCase();
  if (role !== 'owner' && role !== 'admin') {
    const err = new Error('Chỉ org admin được xem / sửa governance');
    err.statusCode = 403;
    throw err;
  }
  return scope;
}

async function getOrCreateSettings(organizationId) {
  let doc = await GovernanceSettings.findOne({ organizationId });
  if (!doc) {
    doc = await GovernanceSettings.create({ organizationId });
  }
  return doc;
}

async function getDirectorHealth({ userId, organizationId, includeArchived = false }) {
  await requireOrgAdmin(organizationId, userId);
  const q = { organizationId };
  if (!includeArchived) q.isActive = true;
  const projects = await Project.find(q)
    .select(
      'title status dueDate expectedEndDate isActive budgetStub archivedAt retentionUntil'
    )
    .lean();
  const health = aggregateDirectorHealth(projects);

  // Capacity snapshot tip — FE vẫn gọi P3 riêng; trả hint
  return {
    ...health,
    capacityHint: {
      endpoint: '/api/projects/resources/capacity',
      note: 'Reuse Phase 3 capacity aggregates in UI widgets',
    },
  };
}

async function getRetentionPolicy({ userId, organizationId }) {
  await requireOrgAdmin(organizationId, userId);
  const settings = await getOrCreateSettings(organizationId);
  const archivedCount = await Project.countDocuments({
    organizationId,
    isActive: false,
  });
  return {
    settings: settings.toObject ? settings.toObject() : settings,
    archivedCount,
    runbookPath: 'devops/swarm/backup-retention-runbook.md',
  };
}

async function updateRetentionPolicy({ userId, organizationId, patch = {} }) {
  await requireOrgAdmin(organizationId, userId);
  const settings = await getOrCreateSettings(organizationId);
  const before = settings.toObject();
  if (patch.archiveInactiveAfterDays != null) {
    settings.archiveInactiveAfterDays = Math.min(
      3650,
      Math.max(0, Number(patch.archiveInactiveAfterDays))
    );
  }
  if (patch.defaultRetentionDays != null) {
    settings.defaultRetentionDays = Math.min(
      3650,
      Math.max(1, Number(patch.defaultRetentionDays))
    );
  }
  if (patch.notes != null) {
    settings.notes = String(patch.notes || '').slice(0, 1000);
  }
  settings.updatedBy = userId;
  await settings.save();
  await auditService.recordMutationAudit({
    organizationId,
    actorUserId: userId,
    action: 'governance.retention_updated',
    resourceType: 'governance_settings',
    resourceId: String(settings._id),
    beforeDoc: before,
    afterDoc: settings.toObject(),
    keys: ['archiveInactiveAfterDays', 'defaultRetentionDays', 'notes'],
  });
  return settings.toObject();
}

/**
 * Retention job stub — không hard-delete; chỉ report candidates / set retentionUntil.
 */
async function runRetentionStub({ userId, organizationId, dryRun = true }) {
  await requireOrgAdmin(organizationId, userId);
  const settings = await getOrCreateSettings(organizationId);
  const now = new Date();
  const archived = await Project.find({ organizationId, isActive: false }).lean();
  const candidates = [];
  for (const p of archived) {
    const archivedAt = p.archivedAt ? new Date(p.archivedAt) : p.updatedAt ? new Date(p.updatedAt) : null;
    const days = Number(p.retentionDays || settings.defaultRetentionDays || 365);
    let retentionUntil = p.retentionUntil ? new Date(p.retentionUntil) : null;
    if (!retentionUntil && archivedAt) {
      retentionUntil = new Date(archivedAt.getTime() + days * 86400000);
    }
    const expired = retentionUntil && retentionUntil.getTime() < now.getTime();
    candidates.push({
      projectId: String(p._id),
      title: p.title,
      archivedAt,
      retentionUntil,
      expired: Boolean(expired),
      action: expired ? (dryRun ? 'would_purge_cold_storage' : 'marked_for_ops') : 'retain',
    });
  }

  if (!dryRun) {
    for (const c of candidates.filter((x) => x.expired)) {
      await Project.updateOne(
        { _id: c.projectId },
        { $set: { retentionUntil: c.retentionUntil || now } }
      ).catch(() => {});
    }
  }

  logger.info(
    '[governance] retention stub org=%s dryRun=%s candidates=%s expired=%s',
    organizationId,
    dryRun,
    candidates.length,
    candidates.filter((c) => c.expired).length
  );

  await auditService.recordAudit({
    organizationId,
    actorUserId: userId,
    action: 'governance.retention_stub_run',
    resourceType: 'organization',
    resourceId: String(organizationId),
    before: null,
    after: { dryRun: Boolean(dryRun), candidateCount: candidates.length },
    meta: { expiredCount: candidates.filter((c) => c.expired).length },
  });

  return {
    dryRun: Boolean(dryRun),
    settings: settings.toObject(),
    candidates,
  };
}

function getSecurityFeatureFlagsStub() {
  const on = (name) => {
    const raw = String(process.env[name] ?? '0').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
  };
  return {
    mfa: on('AUTH_MFA_ENABLED'),
    sso: on('AUTH_SSO_ENABLED'),
    ipAllowlist: on('AUTH_IP_ALLOWLIST_ENABLED'),
    webauthn: on('AUTH_WEBAUTHN_ENABLED'),
    wave: 'C',
    status: 'deferred',
    note: 'SSO/LDAP/AD/MFA/IP — plan riêng; không đổi auth flow trong P6',
  };
}

function isValidOid(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ''));
}

module.exports = {
  getDirectorHealth,
  getRetentionPolicy,
  updateRetentionPolicy,
  runRetentionStub,
  getOrCreateSettings,
  getSecurityFeatureFlagsStub,
  isValidOid,
};
