const MeetingPlan = require('../models/MeetingPlan');
const Project = require('../models/Project');
const { getPublishedOrBaseline } = require('./effortEstimationConfig.service');
const { weeklyMeetingHoursByRole } = require('../utils/effort/weeklyMeetingHoursByRole');
const { isProjectRbacEnabled } = require('../utils/project/projectPermissionMatrix');
const { assertUserProjectPermission } = require('./projectAccess.service');
const { weekKeyFromDate } = require('../engines/allocation/capacity');

async function assertProject(projectId) {
  const project = await Project.findById(projectId).lean();
  if (!project || project.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return project;
}

async function assertPerm(userId, projectId, permission) {
  if (!isProjectRbacEnabled()) return;
  await assertUserProjectPermission({
    userId,
    projectId,
    permission,
    message: `Thiếu quyền ${permission}`,
  });
}

function serialize(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  return {
    id: String(o._id),
    organizationId: String(o.organizationId),
    projectId: String(o.projectId),
    version: o.version,
    status: o.status,
    configVersionId: o.configVersionId ? String(o.configVersionId) : null,
    lines: o.lines || [],
    timezone: o.timezone || 'Asia/Ho_Chi_Minh',
    notes: o.notes || '',
    confirmedAt: o.confirmedAt,
    confirmedBy: o.confirmedBy ? String(o.confirmedBy) : null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function enumerateWeekKeys(startDate, endDate, tzOffsetHours = 7) {
  const keys = [];
  let cur = weekKeyFromDate(startDate, { tzOffsetHours });
  const endKey = weekKeyFromDate(endDate, { tzOffsetHours });
  if (!cur || !endKey) return keys;
  let guard = 0;
  while (cur <= endKey && guard < 104) {
    keys.push(cur);
    const d = new Date(`${cur}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    cur = d.toISOString().slice(0, 10);
    guard += 1;
  }
  return keys;
}

async function getActivePlan({ userId, projectId }) {
  await assertProject(projectId);
  await assertPerm(userId, projectId, 'planning:view');
  const plan = await MeetingPlan.findOne({
    projectId,
    status: { $in: ['draft', 'confirmed'] },
  })
    .sort({ version: -1 })
    .lean();
  return serialize(plan);
}

async function seedFromOrgConfig({ userId, projectId, body = {} }) {
  const project = await assertProject(projectId);
  await assertPerm(userId, projectId, 'planning:artifact_edit');
  const orgId = project.organizationId;
  const config = await getPublishedOrBaseline(orgId);
  const byRole = weeklyMeetingHoursByRole(config);
  const start =
    body.startDate || project.startDate || project.expectedStartDate || new Date();
  const end =
    body.endDate || project.dueDate || project.expectedEndDate || new Date(Date.now() + 84 * 86400000);
  const weekKeys = enumerateWeekKeys(start, end);
  const lines = [];
  for (const weekKey of weekKeys) {
    for (const [roleKey, hours] of Object.entries(byRole)) {
      if (!(hours > 0)) continue;
      lines.push({
        weekKey,
        roleKey,
        userId: null,
        hours,
        activityId: '',
        source: config.calculationBasis?.source === 'org_published' ? 'org_config' : 'org_config',
      });
    }
  }
  const last = await MeetingPlan.findOne({ projectId }).sort({ version: -1 }).select('version').lean();
  const version = (Number(last?.version) || 0) + 1;
  await MeetingPlan.updateMany(
    { projectId, status: 'draft' },
    { $set: { status: 'superseded' } }
  );
  const doc = await MeetingPlan.create({
    organizationId: orgId,
    projectId,
    version,
    status: 'draft',
    configVersionId: config.id || null,
    lines,
    timezone: config.capacityPolicy?.timezone || 'Asia/Ho_Chi_Minh',
    notes: String(body.notes || '').trim().slice(0, 2000),
    createdBy: userId,
    updatedBy: userId,
  });
  return {
    plan: serialize(doc),
    calculationBasis: config.calculationBasis,
  };
}

async function upsertPlan({ userId, projectId, body = {} }) {
  const project = await assertProject(projectId);
  await assertPerm(userId, projectId, 'planning:artifact_edit');
  let plan = await MeetingPlan.findOne({ projectId, status: 'draft' }).sort({ version: -1 });
  if (!plan) {
    const last = await MeetingPlan.findOne({ projectId }).sort({ version: -1 }).select('version').lean();
    plan = new MeetingPlan({
      organizationId: project.organizationId,
      projectId,
      version: (Number(last?.version) || 0) + 1,
      status: 'draft',
      lines: [],
      createdBy: userId,
    });
  }
  if (Array.isArray(body.lines)) {
    plan.lines = body.lines.slice(0, 500).map((l) => ({
      weekKey: String(l.weekKey || '').slice(0, 16),
      roleKey: String(l.roleKey || '').slice(0, 64),
      userId: l.userId || null,
      hours: Math.max(0, Math.min(80, Number(l.hours) || 0)),
      activityId: String(l.activityId || '').slice(0, 64),
      source: ['org_config', 'ai_suggest', 'manual'].includes(l.source) ? l.source : 'manual',
    }));
  }
  if (body.notes != null) plan.notes = String(body.notes).trim().slice(0, 2000);
  if (body.timezone) plan.timezone = String(body.timezone).trim().slice(0, 64);
  if (body.configVersionId) plan.configVersionId = body.configVersionId;
  plan.updatedBy = userId;
  await plan.save();
  return serialize(plan);
}

async function confirmPlan({ userId, projectId }) {
  await assertProject(projectId);
  await assertPerm(userId, projectId, 'planning:artifact_edit');
  const plan = await MeetingPlan.findOne({ projectId, status: 'draft' }).sort({ version: -1 });
  if (!plan) {
    const err = new Error('Không có MeetingPlan draft');
    err.statusCode = 404;
    throw err;
  }
  plan.status = 'confirmed';
  plan.confirmedAt = new Date();
  plan.confirmedBy = userId;
  plan.updatedBy = userId;
  await plan.save();
  return serialize(plan);
}

/** Snapshot payload for PlanningBaseline */
async function snapshotActivePlan(projectId) {
  const plan = await MeetingPlan.findOne({
    projectId,
    status: { $in: ['draft', 'confirmed'] },
  })
    .sort({ version: -1 })
    .lean();
  if (!plan) return null;
  return {
    meetingPlanId: String(plan._id),
    version: plan.version,
    status: plan.status,
    configVersionId: plan.configVersionId ? String(plan.configVersionId) : null,
    timezone: plan.timezone,
    lineCount: (plan.lines || []).length,
    lines: plan.lines || [],
    snapshottedAt: new Date().toISOString(),
  };
}

/**
 * sourceManifest — adjust future plan lines when project end date changes (preview only returns; apply writes).
 */
function previewEndDatePlanAdjust({ lines = [], newEndDate, tzOffsetHours = 7 }) {
  const endKey = weekKeyFromDate(newEndDate, { tzOffsetHours });
  if (!endKey) return { keep: lines, drop: [], extendWeeks: [] };
  const keep = [];
  const drop = [];
  for (const line of lines) {
    if (String(line.weekKey) <= endKey) keep.push(line);
    else drop.push(line);
  }
  return { keep, drop, endKey };
}

module.exports = {
  getActivePlan,
  seedFromOrgConfig,
  upsertPlan,
  confirmPlan,
  snapshotActivePlan,
  previewEndDatePlanAdjust,
  enumerateWeekKeys,
  serialize,
};
