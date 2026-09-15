const Project = require('../models/Project');
const PlanningArtifact = require('../models/PlanningArtifact');
const PlanningBaseline = require('../models/PlanningBaseline');
const {
  normalizePlanningKind,
  canTransitionPlanningStatus,
  permissionForPlanningTransition,
  PLANNING_ARTIFACT_KINDS,
} = require('../constants/planningArtifact');
const {
  isProjectRbacV2Enabled,
  hasPermission,
} = require('../utils/project/projectPermissionMatrix');
const { assertUserProjectPermission } = require('./projectAccess.service');

async function assertProjectMemberAccess({ userId, projectId }) {
  const project = await Project.findById(projectId).lean();
  if (!project || project.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return project;
}

async function assertPlanningPerm({ userId, projectId, permission, message }) {
  if (!isProjectRbacV2Enabled()) return;
  await assertUserProjectPermission({
    userId,
    projectId,
    permission,
    message: message || `Thiếu quyền ${permission}`,
  });
}

function serializeDoc(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  o.id = String(o._id);
  return o;
}

async function listArtifacts({ userId, projectId, kind, status }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:view' });
  const filter = { projectId, isActive: true };
  if (kind) {
    const k = normalizePlanningKind(kind);
    if (k) filter.kind = k;
  }
  if (status) filter.status = String(status).trim().toLowerCase();
  const rows = await PlanningArtifact.find(filter).sort({ kind: 1, externalKey: 1, version: -1 }).lean();
  return rows.map(serializeDoc);
}

async function getArtifact({ userId, projectId, artifactId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:view' });
  const row = await PlanningArtifact.findOne({ _id: artifactId, projectId, isActive: true }).lean();
  if (!row) {
    const err = new Error('Planning artifact không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return serializeDoc(row);
}

async function createArtifact({ userId, projectId, body = {} }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:artifact_edit' });
  const kind = normalizePlanningKind(body.kind);
  if (!kind) {
    const err = new Error(`kind phải thuộc ${PLANNING_ARTIFACT_KINDS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  const externalKey = String(body.externalKey || '').trim();
  const title = String(body.title || '').trim();
  if (!externalKey || !title) {
    const err = new Error('externalKey và title là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const doc = await PlanningArtifact.create({
    organizationId: project.organizationId,
    projectId,
    kind,
    externalKey: externalKey.slice(0, 64),
    title: title.slice(0, 240),
    summary: String(body.summary || '').trim().slice(0, 2000),
    body: String(body.body || '').trim().slice(0, 20000),
    structured: body.structured && typeof body.structured === 'object' ? body.structured : {},
    parentExternalKey: String(body.parentExternalKey || '').trim().slice(0, 64),
    version: body.version != null ? Number(body.version) || 1 : 1,
    status: 'draft',
    source: body.source === 'ai_suggest' ? 'ai_suggest' : 'manual',
    createdBy: userId,
    updatedBy: userId,
  });
  return serializeDoc(doc);
}

async function updateArtifact({ userId, projectId, artifactId, body = {} }) {
  await assertPlanningPerm({ userId, projectId, permission: 'planning:artifact_edit' });
  const doc = await PlanningArtifact.findOne({ _id: artifactId, projectId, isActive: true });
  if (!doc) {
    const err = new Error('Planning artifact không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (!['draft', 'rejected'].includes(String(doc.status))) {
    const err = new Error('Chỉ sửa được planning artifact draft/rejected');
    err.statusCode = 400;
    throw err;
  }
  if (body.title !== undefined) doc.title = String(body.title || '').trim().slice(0, 240);
  if (body.summary !== undefined) doc.summary = String(body.summary || '').trim().slice(0, 2000);
  if (body.body !== undefined) doc.body = String(body.body || '').trim().slice(0, 20000);
  if (body.structured !== undefined && typeof body.structured === 'object') {
    doc.structured = body.structured;
  }
  if (body.parentExternalKey !== undefined) {
    doc.parentExternalKey = String(body.parentExternalKey || '').trim().slice(0, 64);
  }
  doc.updatedBy = userId;
  await doc.save();
  return serializeDoc(doc);
}

async function transitionArtifact({ userId, projectId, artifactId, toStatus, note = '' }) {
  const doc = await PlanningArtifact.findOne({ _id: artifactId, projectId, isActive: true });
  if (!doc) {
    const err = new Error('Planning artifact không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const from = String(doc.status);
  const to = String(toStatus || '')
    .trim()
    .toLowerCase();
  if (!canTransitionPlanningStatus(from, to)) {
    const err = new Error(`Không chuyển được ${from} → ${to}`);
    err.statusCode = 400;
    throw err;
  }
  const perm = permissionForPlanningTransition(from, to);
  if (perm) {
    await assertPlanningPerm({ userId, projectId, permission: perm });
  }
  doc.status = to;
  doc.updatedBy = userId;
  if (to === 'rejected') {
    doc.rejectionReason = String(note || '').trim().slice(0, 2000);
  }
  const gateNote = String(note || '').trim().slice(0, 1000);
  const stamp = { userId, at: new Date(), note: gateNote };
  if (from === 'ba_review' && (to === 'tech_review' || to === 'rejected')) doc.review.ba = stamp;
  if (from === 'tech_review' && (to === 'pm_review' || to === 'rejected')) doc.review.tech = stamp;
  if (from === 'pm_review' && (to === 'po_review' || to === 'rejected')) doc.review.pm = stamp;
  if (from === 'po_review' && (to === 'approved' || to === 'rejected')) doc.review.po = stamp;
  await doc.save();
  return serializeDoc(doc);
}

async function listBaselines({ userId, projectId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:view' });
  const rows = await PlanningBaseline.find({ projectId, isActive: true }).sort({ createdAt: -1 }).lean();
  return rows.map(serializeDoc);
}

async function cutBaseline({ userId, projectId, body = {} }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:cut_baseline' });
  const approved = await PlanningArtifact.find({
    projectId,
    isActive: true,
    status: 'approved',
  }).lean();
  if (!approved.length) {
    const err = new Error('Chưa có planning artifact approved để cắt baseline');
    err.statusCode = 400;
    err.errorCode = 'PLANNING_NO_APPROVED';
    throw err;
  }
  const planVersion = String(body.planVersion || body.version || '').trim() || `v${Date.now()}`;
  try {
    const doc = await PlanningBaseline.create({
      organizationId: project.organizationId,
      projectId,
      planVersion: planVersion.slice(0, 32),
      title: String(body.title || `Planning Baseline ${planVersion}`).slice(0, 240),
      artifactIds: approved.map((a) => a._id),
      artifactSnapshot: approved.map((a) => ({
        artifactId: a._id,
        kind: a.kind,
        externalKey: a.externalKey,
        title: a.title,
        version: a.version,
        status: a.status,
      })),
      approvedBy: userId,
      approvedAt: new Date(),
      notes: String(body.notes || '').trim().slice(0, 2000),
    });
    return serializeDoc(doc);
  } catch (e) {
    if (e && e.code === 11000) {
      const err = new Error('planVersion đã tồn tại');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
}

async function suggestArtifacts({ userId, projectId, kind }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:view' });
  const k = normalizePlanningKind(kind);
  return {
    jobId: null,
    status: 'stub',
    kind: k,
    suggestions: [],
    message: 'AI Planning suggest sẽ được nối ở wave follow-up',
  };
}

async function publishWbsToDevelopment({ userId, projectId }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:publish_wbs' });
  const rows = await PlanningArtifact.find({
    projectId,
    kind: 'WBS',
    status: 'approved',
    isActive: true,
    publishedWorkItemId: null,
  }).lean();

  let published = 0;
  let PlanningItem = null;
  try {
    PlanningItem = require('../models/PlanningItem');
  } catch {
    PlanningItem = null;
  }

  for (const row of rows) {
    let workItemId = null;
    if (PlanningItem) {
      try {
        const created = await PlanningItem.create({
          organizationId: project.organizationId,
          projectId,
          title: row.title,
          description: row.summary || row.body || '',
          type: 'epic',
          status: 'todo',
          sourcePlanningArtifactId: row._id,
          createdBy: userId,
        });
        workItemId = created._id;
      } catch {
        workItemId = row._id;
      }
    } else {
      workItemId = row._id;
    }
    await PlanningArtifact.updateOne(
      { _id: row._id },
      { $set: { publishedWorkItemId: workItemId, updatedBy: userId } }
    );
    published += 1;
  }

  return { published, total: rows.length };
}

async function planningSummary({ userId, projectId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:view' });
  const [artifacts, baselines] = await Promise.all([
    PlanningArtifact.find({ projectId, isActive: true }).lean(),
    PlanningBaseline.find({ projectId, isActive: true }).lean(),
  ]);
  const byKind = {};
  for (const k of PLANNING_ARTIFACT_KINDS) {
    const ofKind = artifacts.filter((a) => a.kind === k);
    byKind[k] = {
      total: ofKind.length,
      approved: ofKind.filter((a) => a.status === 'approved').length,
      draft: ofKind.filter((a) => a.status === 'draft').length,
    };
  }
  return {
    byKind,
    baselineCount: baselines.length,
    planningBaselineExists: baselines.length > 0,
  };
}

module.exports = {
  listArtifacts,
  getArtifact,
  createArtifact,
  updateArtifact,
  transitionArtifact,
  listBaselines,
  cutBaseline,
  suggestArtifacts,
  publishWbsToDevelopment,
  planningSummary,
};
