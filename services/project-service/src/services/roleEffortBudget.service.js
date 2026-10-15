const mongoose = require('../db');
const RoleEffortBudgetTemplate = require('../models/RoleEffortBudgetTemplate');
const ProjectRoleEffortBudget = require('../models/ProjectRoleEffortBudget');
const Project = require('../models/Project');
const {
  SYSTEM_ROLE_EFFORT_BUDGET_LINES,
  BUDGET_SEED_ROLES,
  isForecastCapacityV1Enabled,
} = require('../constants/roleEffortBudgetDefaults');
const { applyAllocateFromBudget } = require('../engines/allocation/forecastDemand');
const { coerceDeliveryPhase } = require('../constants/projectDeliveryPhase');

function asOid(id) {
  const s = String(id || '').trim();
  return mongoose.isValidObjectId(s) ? s : '';
}

function normalizeRoleKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

async function ensurePublishedTemplate(organizationId, actorUserId = null) {
  const orgId = asOid(organizationId);
  if (!orgId) {
    const err = new Error('organizationId bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  let published = await RoleEffortBudgetTemplate.findOne({
    organizationId: orgId,
    status: 'published',
  })
    .sort({ version: -1 })
    .lean();
  if (published) return published;

  const created = await RoleEffortBudgetTemplate.create({
    organizationId: orgId,
    version: 1,
    status: 'published',
    title: 'System baseline Role Effort Budget',
    lines: SYSTEM_ROLE_EFFORT_BUDGET_LINES.map((l) => ({ ...l })),
    publishedAt: new Date(),
    publishedBy: actorUserId || null,
    createdBy: actorUserId || null,
    updatedBy: actorUserId || null,
  });
  return created.toObject ? created.toObject() : created;
}

async function listTemplates(organizationId) {
  const orgId = asOid(organizationId);
  if (!orgId) {
    const err = new Error('organizationId bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const rows = await RoleEffortBudgetTemplate.find({ organizationId: orgId })
    .sort({ version: -1 })
    .lean();
  return { items: rows };
}

async function upsertTemplate({
  organizationId,
  actorUserId,
  title,
  lines,
  publish = false,
  version = null,
} = {}) {
  const orgId = asOid(organizationId);
  if (!orgId) {
    const err = new Error('organizationId bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const normalizedLines = (Array.isArray(lines) ? lines : [])
    .map((l) => ({
      roleKey: normalizeRoleKey(l.roleKey),
      deliveryPhase: String(l.deliveryPhase || '').trim(),
      hoursPerWeek: Math.max(0, Math.min(80, Number(l.hoursPerWeek) || 0)),
      activityLabel: String(l.activityLabel || '').trim().slice(0, 160),
      spreadPolicy: ['even_weeks', 'front_loaded', 'back_loaded'].includes(l.spreadPolicy)
        ? l.spreadPolicy
        : 'even_weeks',
      enabled: l.enabled !== false,
    }))
    .filter((l) => l.roleKey && l.deliveryPhase);

  let ver = Number(version);
  if (!Number.isFinite(ver) || ver < 1) {
    const latest = await RoleEffortBudgetTemplate.findOne({ organizationId: orgId })
      .sort({ version: -1 })
      .select('version')
      .lean();
    ver = (Number(latest?.version) || 0) + 1;
  }

  if (publish) {
    await RoleEffortBudgetTemplate.updateMany(
      { organizationId: orgId, status: 'published' },
      { $set: { status: 'archived' } }
    );
  }

  const doc = await RoleEffortBudgetTemplate.findOneAndUpdate(
    { organizationId: orgId, version: ver },
    {
      $set: {
        organizationId: orgId,
        version: ver,
        title: String(title || '').trim().slice(0, 160),
        lines: normalizedLines,
        status: publish ? 'published' : 'draft',
        publishedAt: publish ? new Date() : null,
        publishedBy: publish ? actorUserId || null : null,
        updatedBy: actorUserId || null,
      },
      $setOnInsert: { createdBy: actorUserId || null },
    },
    { upsert: true, new: true }
  ).lean();

  return doc;
}

async function listProjectBudgets(projectId, { status = null } = {}) {
  const pid = asOid(projectId);
  if (!pid) {
    const err = new Error('projectId bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const filter = { projectId: pid };
  if (status) filter.status = status;
  else filter.status = { $in: ['draft', 'approved'] };
  const items = await ProjectRoleEffortBudget.find(filter)
    .sort({ roleKey: 1, deliveryPhase: 1, baselineVersion: -1 })
    .lean();
  return { items };
}

async function seedBudgetsForMember({
  organizationId,
  projectId,
  userId,
  projectRoleKeys = [],
  actorUserId = null,
  deliveryPhase = null,
} = {}) {
  if (!isForecastCapacityV1Enabled()) {
    return { seeded: 0, skipped: true, reason: 'flag_off' };
  }
  const orgId = asOid(organizationId);
  const pid = asOid(projectId);
  const uid = asOid(userId);
  if (!orgId || !pid || !uid) return { seeded: 0, skipped: true, reason: 'ids' };

  const keys = [...new Set((projectRoleKeys || []).map(normalizeRoleKey).filter(Boolean))];
  const seedKeys = keys.filter((k) => BUDGET_SEED_ROLES.includes(k));
  if (!seedKeys.length) return { seeded: 0, skipped: true, reason: 'no_seed_roles' };

  const project = await Project.findById(pid).select('deliveryPhase startDate endDate').lean();
  const phase =
    coerceDeliveryPhase(deliveryPhase || project?.deliveryPhase) || 'requirement_analysis';

  const template = await ensurePublishedTemplate(orgId, actorUserId);
  const lines = (template.lines || []).filter(
    (l) =>
      l.enabled !== false &&
      seedKeys.includes(normalizeRoleKey(l.roleKey)) &&
      String(l.deliveryPhase) === phase
  );

  let seeded = 0;
  for (const line of lines) {
    const roleKey = normalizeRoleKey(line.roleKey);
    const existing = await ProjectRoleEffortBudget.findOne({
      projectId: pid,
      userId: uid,
      roleKey,
      deliveryPhase: phase,
      status: { $in: ['draft', 'approved'] },
    })
      .sort({ baselineVersion: -1 })
      .lean();
    if (existing) continue;

    const hours = Math.max(0, Math.min(80, Number(line.hoursPerWeek) || 0));
    await ProjectRoleEffortBudget.create({
      organizationId: orgId,
      projectId: pid,
      userId: uid,
      roleKey,
      deliveryPhase: phase,
      hoursPerWeek: hours,
      residualHoursPerWeek: hours,
      phaseStartDate: project?.startDate || new Date(),
      phaseEndDate: project?.endDate || null,
      spreadPolicy: line.spreadPolicy || 'even_weeks',
      activityLabel: line.activityLabel || '',
      baselineVersion: 1,
      status: 'draft',
      templateVersion: template.version,
      createdBy: actorUserId || null,
      updatedBy: actorUserId || null,
    });
    seeded += 1;
  }
  return { seeded, phase, templateVersion: template.version };
}

async function patchProjectBudget({
  projectId,
  budgetId,
  actorUserId,
  hoursPerWeek,
  activityLabel,
  spreadPolicy,
  phaseStartDate,
  phaseEndDate,
} = {}) {
  const pid = asOid(projectId);
  const bid = asOid(budgetId);
  if (!pid || !bid) {
    const err = new Error('projectId/budgetId bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const current = await ProjectRoleEffortBudget.findOne({ _id: bid, projectId: pid });
  if (!current) {
    const err = new Error('Budget không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const nextHours =
    hoursPerWeek != null
      ? Math.max(0, Math.min(80, Number(hoursPerWeek) || 0))
      : current.hoursPerWeek;
  const allocatedSum = (current.allocationLinks || []).reduce(
    (s, l) => s + (Number(l.hours) || 0),
    0
  );
  const residual = Math.max(0, Math.round((nextHours - allocatedSum) * 100) / 100);

  if (current.status === 'approved') {
    current.status = 'superseded';
    await current.save();
    const created = await ProjectRoleEffortBudget.create({
      organizationId: current.organizationId,
      projectId: current.projectId,
      userId: current.userId,
      roleKey: current.roleKey,
      deliveryPhase: current.deliveryPhase,
      hoursPerWeek: nextHours,
      residualHoursPerWeek: residual,
      phaseStartDate:
        phaseStartDate !== undefined
          ? phaseStartDate
            ? new Date(phaseStartDate)
            : null
          : current.phaseStartDate,
      phaseEndDate:
        phaseEndDate !== undefined
          ? phaseEndDate
            ? new Date(phaseEndDate)
            : null
          : current.phaseEndDate,
      spreadPolicy: spreadPolicy || current.spreadPolicy,
      activityLabel:
        activityLabel !== undefined ? String(activityLabel || '').slice(0, 160) : current.activityLabel,
      baselineVersion: (Number(current.baselineVersion) || 1) + 1,
      status: 'draft',
      allocationLinks: current.allocationLinks || [],
      templateVersion: current.templateVersion,
      createdBy: actorUserId || null,
      updatedBy: actorUserId || null,
    });
    return created.toObject();
  }

  current.hoursPerWeek = nextHours;
  current.residualHoursPerWeek = residual;
  if (activityLabel !== undefined) current.activityLabel = String(activityLabel || '').slice(0, 160);
  if (spreadPolicy) current.spreadPolicy = spreadPolicy;
  if (phaseStartDate !== undefined) {
    current.phaseStartDate = phaseStartDate ? new Date(phaseStartDate) : null;
  }
  if (phaseEndDate !== undefined) {
    current.phaseEndDate = phaseEndDate ? new Date(phaseEndDate) : null;
  }
  current.updatedBy = actorUserId || null;
  await current.save();
  return current.toObject();
}

async function approveProjectBudget({ projectId, budgetId, actorUserId } = {}) {
  const pid = asOid(projectId);
  const bid = asOid(budgetId);
  const doc = await ProjectRoleEffortBudget.findOne({ _id: bid, projectId: pid });
  if (!doc) {
    const err = new Error('Budget không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  doc.status = 'approved';
  doc.approvedAt = new Date();
  doc.approvedBy = actorUserId || null;
  doc.updatedBy = actorUserId || null;
  await doc.save();
  return doc.toObject();
}

async function allocateFromBudget({
  projectId,
  budgetId,
  actorUserId,
  hours,
  targetType,
  targetId,
  weekKey = null,
} = {}) {
  const pid = asOid(projectId);
  const bid = asOid(budgetId);
  const doc = await ProjectRoleEffortBudget.findOne({ _id: bid, projectId: pid });
  if (!doc) {
    const err = new Error('Budget không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const tt = String(targetType || '').toLowerCase();
  if (!['task', 'meeting'].includes(tt) || !String(targetId || '').trim()) {
    const err = new Error('targetType/targetId bắt buộc (task|meeting)');
    err.statusCode = 400;
    throw err;
  }
  const math = applyAllocateFromBudget({
    hoursPerWeek: doc.hoursPerWeek,
    residualHoursPerWeek: doc.residualHoursPerWeek,
    allocateHours: hours,
  });
  if (!math.ok) {
    const err = new Error(math.message);
    err.statusCode = 400;
    throw err;
  }
  doc.residualHoursPerWeek = math.residualHoursPerWeek;
  doc.allocationLinks = [
    ...(doc.allocationLinks || []),
    {
      targetType: tt,
      targetId: String(targetId).trim(),
      hours: math.hoursAllocated,
      weekKey: weekKey || null,
      allocatedAt: new Date(),
      allocatedBy: actorUserId || null,
    },
  ];
  doc.updatedBy = actorUserId || null;
  await doc.save();
  return doc.toObject();
}

/**
 * Active (draft|approved latest) budgets for users — for forecast engine.
 */
async function loadActiveBudgetsForUsers({ organizationId, userIds = [] } = {}) {
  const orgId = asOid(organizationId);
  const ids = [...new Set((userIds || []).map(String).filter((id) => mongoose.isValidObjectId(id)))];
  if (!orgId || !ids.length) return [];
  const rows = await ProjectRoleEffortBudget.find({
    organizationId: orgId,
    userId: { $in: ids },
    status: { $in: ['draft', 'approved'] },
  })
    .sort({ baselineVersion: -1 })
    .lean();

  // Keep highest baselineVersion per user+role+phase among non-superseded
  const best = new Map();
  for (const row of rows) {
    const key = `${row.userId}|${row.roleKey}|${row.deliveryPhase}`;
    if (!best.has(key)) best.set(key, row);
  }
  return [...best.values()];
}

module.exports = {
  ensurePublishedTemplate,
  listTemplates,
  upsertTemplate,
  listProjectBudgets,
  seedBudgetsForMember,
  patchProjectBudget,
  approveProjectBudget,
  allocateFromBudget,
  loadActiveBudgetsForUsers,
  isForecastCapacityV1Enabled,
};
