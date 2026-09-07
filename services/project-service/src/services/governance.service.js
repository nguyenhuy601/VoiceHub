const mongoose = require('../db');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Sprint = require('../models/Sprint');
const GovernanceSettings = require('../models/GovernanceSettings');
const { aggregateDirectorHealth } = require('../utils/directorHealth');
const { loadProjectCardProgress } = require('./projectHealthRollup.service');
const {
  emptyCapacitySummary,
  summarizePortfolioCapacity,
} = require('../utils/projectHealthCapacity');
const {
  assertCanViewGovernanceReports,
  assertOrgAdminOnly,
  buildActiveProjectsFilter,
} = require('./governanceAccess.service');
const auditService = require('./audit.service');
const { logger } = require('@enterprise/shared');
const { normalizeWorkingCalendar } = require('../utils/workingCalendar');

function sanitizeHolidayPatch(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const row of raw.slice(0, 366)) {
    if (!row || typeof row !== 'object') continue;
    const d = new Date(row.date);
    if (Number.isNaN(d.getTime())) continue;
    out.push({
      date: d,
      name: String(row.name || '').trim().slice(0, 120),
    });
  }
  return out;
}

function sanitizeWorkingCalendarPatch(raw) {
  if (raw == null || typeof raw !== 'object') return null;
  return normalizeWorkingCalendar(raw);
}

async function getOrCreateSettings(organizationId) {
  let doc = await GovernanceSettings.findOne({ organizationId });
  if (!doc) {
    doc = await GovernanceSettings.create({ organizationId });
  }
  return doc;
}

async function getDirectorHealth({ userId, organizationId, includeArchived = false }) {
  await assertCanViewGovernanceReports(organizationId, userId);
  const q = buildActiveProjectsFilter(organizationId, { includeArchived });
  const projects = await Project.find(q)
    .select(
      'title projectCode status dueDate expectedEndDate isActive budgetStub archivedAt retentionUntil'
    )
    .lean();
  const asOf = new Date();
  const projectIds = projects.map((p) => p._id).filter(Boolean);

  let activeSprints = [];
  try {
    if (projectIds.length && mongoose.isValidObjectId(organizationId)) {
      activeSprints = await Sprint.find({
        organizationId,
        projectId: { $in: projectIds },
        status: 'active',
      })
        .select('_id projectId name endDate')
        .lean();
    }
  } catch (err) {
    logger.warn('[director-health] active sprint lookup failed: %s', err?.message || err);
  }

  const sprintByProjectId = new Map();
  for (const sp of activeSprints) {
    const pid = String(sp.projectId || '');
    if (!pid || sprintByProjectId.has(pid)) continue;
    sprintByProjectId.set(pid, {
      sprintId: String(sp._id),
      name: String(sp.name || ''),
      endDate: sp.endDate || null,
    });
  }

  let progressByProjectId = new Map();
  try {
    progressByProjectId = await loadProjectCardProgress({
      organizationId,
      projectIds,
      asOf,
      activeSprintIds: activeSprints.map((s) => s._id),
    });
  } catch (err) {
    logger.warn('[director-health] card rollup failed: %s', err?.message || err);
  }

  let capacity = emptyCapacitySummary();
  try {
    const members = await ProjectMember.find({
      organizationId,
      status: 'active',
    })
      .select('userId projectId allocations')
      .lean();
    capacity = summarizePortfolioCapacity(members, { projectIds, asOf });
  } catch (err) {
    logger.warn('[director-health] capacity summary failed: %s', err?.message || err);
  }

  const health = aggregateDirectorHealth(projects, asOf, progressByProjectId);
  for (const row of health.projects) {
    const sprint = sprintByProjectId.get(row.projectId);
    if (sprint) row.sprint = sprint;
  }

  return {
    ...health,
    capacity,
    capacityHint: {
      endpoint: '/api/projects/resources/capacity',
      note: 'Planned allocation rollup on this payload; department FTE remains Phase 3 API',
    },
    burndownHint: {
      note: 'Active sprint commitment is on each project row; full burndown chart stays on hub',
      endpoint: '/api/projects/:projectId/sprints/:sprintId/time-summary',
    },
  };
}

async function getRetentionPolicy({ userId, organizationId }) {
  await assertOrgAdminOnly(organizationId, userId);
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
  await assertOrgAdminOnly(organizationId, userId);
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
  await assertOrgAdminOnly(organizationId, userId);
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

async function getWorkingCalendarPolicy({ userId, organizationId }) {
  await assertOrgAdminOnly(organizationId, userId);
  const settings = await getOrCreateSettings(organizationId);
  const doc = settings.toObject ? settings.toObject() : settings;
  return {
    workingCalendar: normalizeWorkingCalendar(doc.workingCalendar || {}),
    holidays: Array.isArray(doc.holidays) ? doc.holidays : [],
  };
}

async function updateWorkingCalendarPolicy({ userId, organizationId, patch = {} }) {
  await assertOrgAdminOnly(organizationId, userId);
  const settings = await getOrCreateSettings(organizationId);
  const before = settings.toObject();
  if (patch.workingCalendar != null) {
    const cal = sanitizeWorkingCalendarPatch(patch.workingCalendar);
    if (cal) {
      settings.workingCalendar = {
        hoursPerDay: cal.hoursPerDay,
        workingDayIndexes: cal.workingDayIndexes,
        billingDaysPerMonth: cal.billingDaysPerMonth,
      };
    }
  }
  if (patch.holidays != null) {
    const holidays = sanitizeHolidayPatch(patch.holidays);
    if (holidays) settings.holidays = holidays;
  }
  settings.updatedBy = userId;
  await settings.save();
  await auditService.recordMutationAudit({
    organizationId,
    actorUserId: userId,
    action: 'governance.working_calendar_updated',
    resourceType: 'governance_settings',
    resourceId: String(settings._id),
    beforeDoc: before,
    afterDoc: settings.toObject(),
    keys: ['workingCalendar', 'holidays'],
  });
  return {
    workingCalendar: normalizeWorkingCalendar(settings.workingCalendar || {}),
    holidays: settings.holidays || [],
  };
}

/** S2S / capacity — không cần org admin. */
async function fetchOrgWorkingCalendar(organizationId) {
  const settings = await getOrCreateSettings(organizationId);
  const doc = settings.toObject ? settings.toObject() : settings;
  return {
    workingCalendar: normalizeWorkingCalendar(doc.workingCalendar || {}),
    holidays: Array.isArray(doc.holidays) ? doc.holidays : [],
  };
}

module.exports = {
  getDirectorHealth,
  getRetentionPolicy,
  updateRetentionPolicy,
  runRetentionStub,
  getOrCreateSettings,
  getSecurityFeatureFlagsStub,
  buildActiveProjectsFilter,
  isValidOid,
  getWorkingCalendarPolicy,
  updateWorkingCalendarPolicy,
  fetchOrgWorkingCalendar,
};
