const mongoose = require('../db');
const EffortEstimationConfig = require('../models/EffortEstimationConfig');
const {
  SYSTEM_MEETING_ACTIVITIES,
  SYSTEM_CAPACITY_POLICY,
} = require('../constants/effortEstimationDefaults');
const { assertOrgAdminOnly } = require('./governanceAccess.service');
const auditService = require('./audit.service');

function isValidOid(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ''));
}

function sanitizeActivities(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 64).map((row, i) => ({
    activityId: String(row.activityId || `act_${i + 1}`)
      .trim()
      .slice(0, 64),
    name: String(row.name || '').trim().slice(0, 160) || `Activity ${i + 1}`,
    workType: ['MEETING', 'GOVERNANCE', 'DELIVERY', 'OTHER'].includes(row.workType)
      ? row.workType
      : 'MEETING',
    applicableRoleKeys: Array.isArray(row.applicableRoleKeys)
      ? row.applicableRoleKeys.map((k) => String(k).trim()).filter(Boolean).slice(0, 24)
      : [],
    estimationMethod: ['fixed', 'recurring_weekly', 'per_task'].includes(row.estimationMethod)
      ? row.estimationMethod
      : 'recurring_weekly',
    effortHoursPerUnit: Math.max(0, Math.min(80, Number(row.effortHoursPerUnit) || 0)),
    unitsPerPeriod: Math.max(0, Math.min(40, Number(row.unitsPerPeriod) || 0)),
    enabled: row.enabled !== false,
  }));
}

function sanitizeCapacityPolicy(raw = {}) {
  return {
    hoursPerWeekDefault: Math.max(
      1,
      Math.min(80, Number(raw.hoursPerWeekDefault) || SYSTEM_CAPACITY_POLICY.hoursPerWeekDefault)
    ),
    overloadWarnPct: Math.max(
      50,
      Math.min(200, Number(raw.overloadWarnPct) || SYSTEM_CAPACITY_POLICY.overloadWarnPct)
    ),
    planExceedSuggestChangePct: Math.max(
      5,
      Math.min(
        100,
        Number(raw.planExceedSuggestChangePct) || SYSTEM_CAPACITY_POLICY.planExceedSuggestChangePct
      )
    ),
    timezone: String(raw.timezone || SYSTEM_CAPACITY_POLICY.timezone)
      .trim()
      .slice(0, 64),
  };
}

function toPublic(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(o._id),
    organizationId: String(o.organizationId),
    version: o.version,
    status: o.status,
    title: o.title || '',
    activities: o.activities || [],
    capacityPolicy: o.capacityPolicy || { ...SYSTEM_CAPACITY_POLICY },
    publishedAt: o.publishedAt || null,
    publishedBy: o.publishedBy ? String(o.publishedBy) : null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    calculationBasis: {
      source: o.status === 'published' ? 'org_published' : o.status === 'draft' ? 'org_draft' : 'archived',
      systemBaselineAvailable: true,
    },
  };
}

async function nextVersion(organizationId) {
  const last = await EffortEstimationConfig.findOne({ organizationId })
    .sort({ version: -1 })
    .select('version')
    .lean();
  return (Number(last?.version) || 0) + 1;
}

/** Public read of Published config or system baseline warning (no admin required). */
async function getPublishedOrBaseline(organizationId) {
  if (!isValidOid(organizationId)) {
    const err = new Error('organizationId không hợp lệ');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_REQUIRED';
    throw err;
  }
  const published = await EffortEstimationConfig.findOne({
    organizationId,
    status: 'published',
  })
    .sort({ version: -1 })
    .lean();
  if (published) {
    return {
      ...toPublic(published),
      calculationBasis: {
        source: 'org_published',
        configVersionId: String(published._id),
        version: published.version,
        ptoExcluded: true,
      },
    };
  }
  return {
    id: null,
    organizationId: String(organizationId),
    version: 0,
    status: 'system_baseline',
    title: 'System baseline (unpublished)',
    activities: SYSTEM_MEETING_ACTIVITIES.map((a) => ({ ...a })),
    capacityPolicy: { ...SYSTEM_CAPACITY_POLICY },
    publishedAt: null,
    publishedBy: null,
    calculationBasis: {
      source: 'system_baseline_warning',
      warning: 'Organization has not published EffortEstimationConfig; using system baseline.',
      ptoExcluded: true,
    },
  };
}

async function listVersions({ userId, organizationId }) {
  await assertOrgAdminOnly(organizationId, userId);
  const rows = await EffortEstimationConfig.find({ organizationId })
    .sort({ version: -1 })
    .lean();
  return rows.map(toPublic);
}

async function getDraft({ userId, organizationId }) {
  await assertOrgAdminOnly(organizationId, userId);
  let draft = await EffortEstimationConfig.findOne({
    organizationId,
    status: 'draft',
  }).sort({ version: -1 });
  if (!draft) {
    const version = await nextVersion(organizationId);
    draft = await EffortEstimationConfig.create({
      organizationId,
      version,
      status: 'draft',
      title: `Draft v${version}`,
      activities: SYSTEM_MEETING_ACTIVITIES.map((a) => ({ ...a })),
      capacityPolicy: { ...SYSTEM_CAPACITY_POLICY },
      createdBy: userId,
      updatedBy: userId,
    });
  }
  return toPublic(draft);
}

async function updateDraft({ userId, organizationId, patch = {} }) {
  await assertOrgAdminOnly(organizationId, userId);
  const draft = await EffortEstimationConfig.findOne({
    organizationId,
    status: 'draft',
  }).sort({ version: -1 });
  if (!draft) {
    const err = new Error('Không có draft — gọi GET draft trước');
    err.statusCode = 404;
    err.errorCode = 'NOT_FOUND';
    throw err;
  }
  const before = draft.toObject();
  if (patch.title != null) draft.title = String(patch.title).trim().slice(0, 160);
  if (patch.activities != null) {
    const acts = sanitizeActivities(patch.activities);
    if (acts) draft.activities = acts;
  }
  if (patch.capacityPolicy != null) {
    draft.capacityPolicy = sanitizeCapacityPolicy(patch.capacityPolicy);
  }
  draft.updatedBy = userId;
  await draft.save();
  await auditService.recordMutationAudit({
    organizationId,
    actorUserId: userId,
    action: 'effort_estimation.draft_updated',
    resourceType: 'effort_estimation_config',
    resourceId: String(draft._id),
    beforeDoc: before,
    afterDoc: draft.toObject(),
    keys: ['title', 'activities', 'capacityPolicy'],
  });
  return toPublic(draft);
}

async function publishDraft({ userId, organizationId }) {
  await assertOrgAdminOnly(organizationId, userId);
  const draft = await EffortEstimationConfig.findOne({
    organizationId,
    status: 'draft',
  }).sort({ version: -1 });
  if (!draft) {
    const err = new Error('Không có draft để publish');
    err.statusCode = 404;
    err.errorCode = 'NOT_FOUND';
    throw err;
  }
  await EffortEstimationConfig.updateMany(
    { organizationId, status: 'published' },
    { $set: { status: 'archived', updatedBy: userId } }
  );
  draft.status = 'published';
  draft.publishedAt = new Date();
  draft.publishedBy = userId;
  draft.updatedBy = userId;
  await draft.save();
  // New empty draft for next edits
  const next = await nextVersion(organizationId);
  await EffortEstimationConfig.create({
    organizationId,
    version: next,
    status: 'draft',
    title: `Draft v${next}`,
    activities: (draft.activities || []).map((a) => ({ ...a.toObject?.() || a })),
    capacityPolicy: draft.capacityPolicy || { ...SYSTEM_CAPACITY_POLICY },
    createdBy: userId,
    updatedBy: userId,
  });
  return toPublic(draft);
}

const { weeklyMeetingHoursByRole } = require('../utils/effort/weeklyMeetingHoursByRole');

module.exports = {
  getPublishedOrBaseline,
  listVersions,
  getDraft,
  updateDraft,
  publishDraft,
  weeklyMeetingHoursByRole,
  toPublic,
  SYSTEM_MEETING_ACTIVITIES,
  SYSTEM_CAPACITY_POLICY,
};
