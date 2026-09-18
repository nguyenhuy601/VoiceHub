const Project = require('../models/Project');
const PlanningArtifact = require('../models/PlanningArtifact');
const PlanningBaseline = require('../models/PlanningBaseline');
const {
  normalizePlanningKind,
  canTransitionPlanningStatus,
  permissionForPlanningTransition,
  PLANNING_ARTIFACT_KINDS,
} = require('../constants/planningArtifact');
const { evaluatePlanningBaselineReadiness } = require('../constants/planningBaselinePolicy');
const { normalizePlanningStructured } = require('../utils/planning/resourceStructured');
const { isProjectRbacV2Enabled } = require('../utils/project/projectPermissionMatrix');
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

async function recordPlanningAudit({
  organizationId,
  actorUserId,
  action,
  resourceId,
  before = null,
  after = null,
  meta = {},
}) {
  try {
    const { recordAudit } = require('./audit.service');
    await recordAudit({
      organizationId,
      actorUserId,
      action,
      resourceType: 'planning_artifact',
      resourceId: String(resourceId || ''),
      before,
      after,
      meta,
    });
  } catch {
    /* best-effort */
  }
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
  const rows = await PlanningArtifact.find(filter)
    .sort({ kind: 1, externalKey: 1, version: -1 })
    .lean();
  return rows.map(serializeDoc);
}

async function getArtifact({ userId, projectId, artifactId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:view' });
  const row = await PlanningArtifact.findOne({
    _id: artifactId,
    projectId,
    isActive: true,
  }).lean();
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
  const structured = normalizePlanningStructured(
    kind,
    body.structured && typeof body.structured === 'object' ? body.structured : {}
  );
  const doc = await PlanningArtifact.create({
    organizationId: project.organizationId,
    projectId,
    kind,
    externalKey: externalKey.slice(0, 64),
    title: title.slice(0, 240),
    summary: String(body.summary || '').trim().slice(0, 2000),
    body: String(body.body || '').trim().slice(0, 20000),
    structured,
    parentExternalKey: String(body.parentExternalKey || '').trim().slice(0, 64),
    version: body.version != null ? Number(body.version) || 1 : 1,
    status: 'draft',
    source:
      body.source === 'ai_suggest'
        ? 'ai_suggest'
        : body.source === 'import'
          ? 'import'
          : 'manual',
    createdBy: userId,
    updatedBy: userId,
  });
  await recordPlanningAudit({
    organizationId: project.organizationId,
    actorUserId: userId,
    action: 'planning.artifact.created',
    resourceId: doc._id,
    after: { kind, externalKey: doc.externalKey, status: 'draft', source: doc.source },
    meta: { projectId: String(projectId) },
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
  const before = { title: doc.title, status: doc.status };
  if (body.title !== undefined) doc.title = String(body.title || '').trim().slice(0, 240);
  if (body.summary !== undefined) doc.summary = String(body.summary || '').trim().slice(0, 2000);
  if (body.body !== undefined) doc.body = String(body.body || '').trim().slice(0, 20000);
  if (body.structured !== undefined && typeof body.structured === 'object') {
    doc.structured = normalizePlanningStructured(doc.kind, body.structured);
  }
  if (body.parentExternalKey !== undefined) {
    doc.parentExternalKey = String(body.parentExternalKey || '').trim().slice(0, 64);
  }
  doc.updatedBy = userId;
  await doc.save();
  await recordPlanningAudit({
    organizationId: doc.organizationId,
    actorUserId: userId,
    action: 'planning.artifact.updated',
    resourceId: doc._id,
    before,
    after: { title: doc.title, status: doc.status },
    meta: { projectId: String(projectId) },
  });
  return serializeDoc(doc);
}

function applyReviewStamp(doc, from, to, stamp) {
  if (from === 'ba_review' && (to === 'tech_review' || to === 'rejected')) doc.review.ba = stamp;
  if (from === 'tech_review' && (to === 'pm_review' || to === 'rejected')) doc.review.tech = stamp;
  if (from === 'pm_review' && (to === 'po_review' || to === 'rejected')) doc.review.pm = stamp;
  if (from === 'po_review' && (to === 'approved' || to === 'rejected')) doc.review.po = stamp;
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
  const beforeStatus = doc.status;
  doc.status = to;
  doc.updatedBy = userId;
  if (to === 'rejected') {
    doc.rejectionReason = String(note || '').trim().slice(0, 2000);
  }
  const gateNote = String(note || '').trim().slice(0, 1000);
  const stamp = { userId, at: new Date(), note: gateNote };
  applyReviewStamp(doc, from, to, stamp);
  await doc.save();
  await recordPlanningAudit({
    organizationId: doc.organizationId,
    actorUserId: userId,
    action: 'planning.artifact.transitioned',
    resourceId: doc._id,
    before: { status: beforeStatus },
    after: { status: to },
    meta: { projectId: String(projectId), note: gateNote },
  });
  return serializeDoc(doc);
}

async function bulkTransitionArtifacts({
  userId,
  projectId,
  fromStatus,
  toStatus,
  note = '',
  kind = null,
}) {
  await assertProjectMemberAccess({ userId, projectId });
  const from = String(fromStatus || '')
    .trim()
    .toLowerCase();
  const to = String(toStatus || '')
    .trim()
    .toLowerCase();
  if (!canTransitionPlanningStatus(from, to)) {
    const err = new Error(`Không bulk chuyển được ${from} → ${to}`);
    err.statusCode = 400;
    err.errorCode = 'PLANNING_TRANSITION_DENIED';
    throw err;
  }

  const perm = permissionForPlanningTransition(from, to);
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  if (!bypass && perm) {
    await assertPlanningPerm({ userId, projectId, permission: perm });
  }

  const gateNote = String(note || '').trim().slice(0, 1000);
  const stamp = { userId, at: new Date(), note: gateNote };
  const filter = { projectId, isActive: true, status: from };
  const k = normalizePlanningKind(kind);
  if (k) filter.kind = k;

  let skippedFourEyes = 0;
  if (from === 'ba_review' && to === 'tech_review' && !bypass) {
    const ownCount = await PlanningArtifact.countDocuments({ ...filter, createdBy: userId });
    skippedFourEyes = ownCount;
    filter.createdBy = { $ne: userId };
  }

  const candidateCount = await PlanningArtifact.countDocuments({
    projectId,
    isActive: true,
    status: from,
    ...(k ? { kind: k } : {}),
  });

  const $set = {
    status: to,
    updatedBy: userId,
    updatedAt: new Date(),
  };
  if (from === 'ba_review' && (to === 'tech_review' || to === 'rejected')) {
    $set['review.ba'] = stamp;
  }
  if (from === 'tech_review' && (to === 'pm_review' || to === 'rejected')) {
    $set['review.tech'] = stamp;
  }
  if (from === 'pm_review' && (to === 'po_review' || to === 'rejected')) {
    $set['review.pm'] = stamp;
  }
  if (from === 'po_review' && (to === 'approved' || to === 'rejected')) {
    $set['review.po'] = stamp;
  }
  if (to === 'rejected' && gateNote) {
    $set.rejectionReason = gateNote;
  }

  const ids = await PlanningArtifact.find(filter).select('_id').limit(500).lean();
  const idList = ids.map((r) => r._id);
  let updated = 0;
  if (idList.length) {
    const res = await PlanningArtifact.updateMany(
      { _id: { $in: idList }, projectId, isActive: true, status: from },
      { $set }
    );
    updated = res.modifiedCount || 0;
  }

  return {
    fromStatus: from,
    toStatus: to,
    candidateCount,
    updated,
    skipped: Math.max(0, candidateCount - updated),
    skippedReasons:
      skippedFourEyes > 0
        ? [
            {
              errorCode: 'PLANNING_FOUR_EYES',
              message: `Bỏ qua ${skippedFourEyes} artifact do four-eyes (author = actor)`,
            },
          ]
        : [],
    truncated: idList.length >= 500,
  };
}

async function listBaselines({ userId, projectId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:view' });
  const rows = await PlanningBaseline.find({ projectId }).sort({ createdAt: -1 }).lean();
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

  const readiness = evaluatePlanningBaselineReadiness(approved);
  if (!readiness.ok) {
    const err = new Error(
      `Thiếu kind bắt buộc để cắt baseline: ${readiness.missingRequired.join(', ')}`
    );
    err.statusCode = 400;
    err.errorCode = 'PLANNING_BASELINE_INCOMPLETE';
    err.details = readiness;
    throw err;
  }

  const planVersion = String(body.planVersion || body.version || '').trim() || `v${Date.now()}`;

  await PlanningBaseline.updateMany(
    { projectId, isActive: true },
    { $set: { isActive: false } }
  );

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
      isActive: true,
    });
    await recordPlanningAudit({
      organizationId: project.organizationId,
      actorUserId: userId,
      action: 'planning.baseline.cut',
      resourceId: doc._id,
      after: {
        planVersion: doc.planVersion,
        artifactCount: approved.length,
        missingRecommended: readiness.missingRecommended,
      },
      meta: { projectId: String(projectId) },
    });
    const out = serializeDoc(doc);
    out.warnings =
      readiness.missingRecommended.length > 0
        ? [
            {
              errorCode: 'PLANNING_BASELINE_RECOMMENDED_MISSING',
              message: `Khuyến nghị bổ sung: ${readiness.missingRecommended.join(', ')}`,
              missingRecommended: readiness.missingRecommended,
            },
          ]
        : [];
    return out;
  } catch (e) {
    if (e && e.code === 11000) {
      const err = new Error('planVersion đã tồn tại');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
}

/**
 * Heuristic suggest từ SRS (HITL — không auto-insert).
 */
async function suggestArtifacts({ userId, projectId, kind }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:view' });
  const k = normalizePlanningKind(kind);
  const suggestions = [];

  let AnalysisArtifact = null;
  let RequirementPack = null;
  try {
    AnalysisArtifact = require('../models/AnalysisArtifact');
    RequirementPack = require('../models/RequirementPack');
  } catch {
    AnalysisArtifact = null;
  }

  const existing = await PlanningArtifact.find({ projectId, isActive: true })
    .select('kind externalKey')
    .lean();
  const existingKeys = new Set(existing.map((a) => `${a.kind}:${a.externalKey}`));

  const targetKinds = k ? [k] : ['WBS', 'RISK', 'RESOURCE', 'MILESTONE', 'SCHEDULE'];

  if (AnalysisArtifact && targetKinds.includes('WBS')) {
    const frs = await AnalysisArtifact.find({
      projectId,
      kind: 'FR',
      status: 'approved',
      isActive: true,
    })
      .select('externalKey title summary')
      .limit(40)
      .lean();
    for (const fr of frs) {
      const externalKey = `WBS-${fr.externalKey || fr._id}`.slice(0, 64);
      if (existingKeys.has(`WBS:${externalKey}`)) continue;
      suggestions.push({
        kind: 'WBS',
        externalKey,
        title: String(fr.title || fr.externalKey || 'WBS').slice(0, 240),
        summary: String(fr.summary || `Derived from FR ${fr.externalKey || ''}`).slice(0, 2000),
        structured: {
          sourceFrKey: fr.externalKey || '',
          effortHours: null,
          skillKeys: [],
        },
        reason: 'heuristic_from_fr',
      });
    }
  }

  if (AnalysisArtifact && targetKinds.includes('RISK')) {
    const nfrs = await AnalysisArtifact.find({
      projectId,
      kind: 'NFR',
      status: 'approved',
      isActive: true,
      'structured.category': { $regex: /^constraint$/i },
    })
      .select('externalKey title summary structured')
      .limit(20)
      .lean();
    for (const nfr of nfrs) {
      const externalKey = `RISK-${nfr.externalKey || nfr._id}`.slice(0, 64);
      if (existingKeys.has(`RISK:${externalKey}`)) continue;
      suggestions.push({
        kind: 'RISK',
        externalKey,
        title: `Risk: ${nfr.title || nfr.externalKey}`.slice(0, 240),
        summary: String(nfr.summary || 'Derived from NFR constraint').slice(0, 2000),
        structured: {
          sourceNfrKey: nfr.externalKey || '',
          impact: 'medium',
          probability: 'medium',
        },
        reason: 'heuristic_from_nfr_constraint',
      });
    }

    if (RequirementPack) {
      const pack = await RequirementPack.findOne({
        projectId,
        status: { $in: ['ACTIVE', 'active', 'approved', 'APPROVED'] },
      })
        .select('assumptions')
        .lean();
      const assumptions = Array.isArray(pack?.assumptions) ? pack.assumptions : [];
      assumptions.slice(0, 15).forEach((a, idx) => {
        const text = typeof a === 'string' ? a : a?.text || a?.assumption || '';
        if (!text) return;
        const externalKey = `RISK-ASM-${idx + 1}`.slice(0, 64);
        if (existingKeys.has(`RISK:${externalKey}`)) return;
        suggestions.push({
          kind: 'RISK',
          externalKey,
          title: `Assumption risk: ${String(text).slice(0, 80)}`.slice(0, 240),
          summary: String(text).slice(0, 2000),
          structured: {
            sourceAssumptionIndex: idx,
            impactIfInvalid: typeof a === 'object' ? a.impactIfInvalid || '' : '',
          },
          reason: 'heuristic_from_assumption',
        });
      });
    }
  }

  if (targetKinds.includes('RESOURCE') && !existingKeys.has('RESOURCE:RES-PLAN-1')) {
    suggestions.push({
      kind: 'RESOURCE',
      externalKey: 'RES-PLAN-1',
      title: 'Resource plan (draft)',
      summary: 'Suggested roles/skills/effort — confirm HITL trước khi tạo',
      structured: {
        roles: [
          {
            roleKey: 'backend_developer',
            title: 'Backend Developer',
            count: 1,
            skillKeys: ['node'],
            effortHours: 80,
          },
          {
            roleKey: 'frontend_developer',
            title: 'Frontend Developer',
            count: 1,
            skillKeys: ['react'],
            effortHours: 80,
          },
          {
            roleKey: 'qa_engineer',
            title: 'QA Engineer',
            count: 1,
            skillKeys: ['manual-test'],
            effortHours: 40,
          },
        ],
      },
      reason: 'heuristic_default_roles',
    });
  }

  if (targetKinds.includes('MILESTONE') && !existingKeys.has('MILESTONE:MS-PHASE2')) {
    suggestions.push({
      kind: 'MILESTONE',
      externalKey: 'MS-PHASE2',
      title: 'Start Development (Phase 2)',
      summary: 'Milestone mở cửa Development sau Plan Baseline',
      structured: { targetPhase: 'development' },
      reason: 'heuristic_default_milestone',
    });
  }

  if (targetKinds.includes('SCHEDULE') && !existingKeys.has('SCHEDULE:SCH-1')) {
    suggestions.push({
      kind: 'SCHEDULE',
      externalKey: 'SCH-1',
      title: 'Delivery schedule (draft)',
      summary: 'High-level schedule placeholder — chỉnh tay trước duyệt',
      structured: { phases: ['planning', 'development', 'qa', 'release'] },
      reason: 'heuristic_default_schedule',
    });
  }

  return {
    jobId: null,
    status: 'ready',
    kind: k,
    suggestions: suggestions.slice(0, 80),
    message:
      suggestions.length > 0
        ? `Gợi ý ${suggestions.length} mục (heuristic HITL) — xác nhận từng dòng để tạo artifact`
        : 'Không có gợi ý mới (đã có artifact hoặc chưa có SRS approved)',
    projectId: String(projectId),
    organizationId: String(project.organizationId || ''),
  };
}

async function confirmSuggestions({ userId, projectId, suggestions = [] }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:artifact_edit' });
  const list = Array.isArray(suggestions) ? suggestions : [];
  const created = [];
  const skipped = [];
  for (const s of list.slice(0, 50)) {
    try {
      const row = await createArtifact({
        userId,
        projectId,
        body: {
          kind: s.kind,
          externalKey: s.externalKey,
          title: s.title,
          summary: s.summary,
          structured: s.structured,
          source: 'ai_suggest',
        },
      });
      created.push(row);
    } catch (e) {
      skipped.push({
        externalKey: s.externalKey,
        message: e.message || 'skip',
        errorCode: e.errorCode || e.code,
      });
    }
  }
  return { created: created.length, skipped, items: created };
}

async function publishWbsToDevelopment({ userId, projectId }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:publish_wbs' });

  const baselineExists = await PlanningBaseline.exists({ projectId, isActive: true });
  if (!baselineExists) {
    const err = new Error('Cần Planning Baseline active trước khi publish WBS');
    err.statusCode = 400;
    err.errorCode = 'PLANNING_BASELINE_REQUIRED';
    throw err;
  }

  const rows = await PlanningArtifact.find({
    projectId,
    kind: { $in: ['WBS', 'MILESTONE', 'RELEASE'] },
    status: 'approved',
    isActive: true,
    publishedWorkItemId: null,
  }).lean();

  let published = 0;
  const PlanningItem = require('../models/PlanningItem');

  for (const row of rows) {
    const type =
      row.kind === 'MILESTONE' ? 'milestone' : row.kind === 'RELEASE' ? 'release' : 'epic';
    const created = await PlanningItem.create({
      organizationId: project.organizationId,
      projectId,
      title: row.title,
      description: row.summary || row.body || '',
      type,
      status: 'todo',
      sourceArtifactId: row._id,
      createdBy: userId,
    });
    await PlanningArtifact.updateOne(
      { _id: row._id },
      { $set: { publishedWorkItemId: created._id, updatedBy: userId } }
    );
    published += 1;
  }

  await recordPlanningAudit({
    organizationId: project.organizationId,
    actorUserId: userId,
    action: 'planning.publish_wbs',
    resourceId: projectId,
    after: { published, total: rows.length },
    meta: { projectId: String(projectId) },
  });

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
  const readiness = evaluatePlanningBaselineReadiness(artifacts);
  return {
    byKind,
    baselineCount: baselines.length,
    planningBaselineExists: baselines.length > 0,
    baselineReadiness: {
      ok: readiness.ok,
      missingRequired: readiness.missingRequired,
      missingRecommended: readiness.missingRecommended,
    },
    activeBaseline: baselines[0]
      ? {
          id: String(baselines[0]._id),
          planVersion: baselines[0].planVersion,
          approvedAt: baselines[0].approvedAt,
          title: baselines[0].title,
        }
      : null,
  };
}

/**
 * RULE-20 — fork version mới từ artifact approved (sau baseline).
 */
async function forkArtifactVersion({ userId, projectId, artifactId, note = '' }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:artifact_edit' });
  const source = await PlanningArtifact.findOne({
    _id: artifactId,
    projectId,
    isActive: true,
  }).lean();
  if (!source) {
    const err = new Error('Planning artifact không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const { buildForkDraftFromArtifact } = require('../utils/planning/forkPlanningArtifact');
  const draft = buildForkDraftFromArtifact(source, userId);

  const existing = await PlanningArtifact.findOne({
    projectId,
    kind: draft.kind,
    externalKey: draft.externalKey,
    version: draft.version,
  }).lean();
  if (existing) {
    const err = new Error(`Đã có version ${draft.version} cho ${draft.externalKey}`);
    err.statusCode = 409;
    err.errorCode = 'PLANNING_VERSION_EXISTS';
    throw err;
  }

  const structured = normalizePlanningStructured(draft.kind, draft.structured);
  const doc = await PlanningArtifact.create({
    organizationId: project.organizationId,
    projectId,
    kind: draft.kind,
    externalKey: draft.externalKey,
    title: draft.title,
    summary: draft.summary,
    body: draft.body,
    structured: {
      ...structured,
      forkedFromArtifactId: draft.forkedFromArtifactId,
      forkedFromVersion: draft.forkedFromVersion,
      forkNote: String(note || '').trim().slice(0, 1000),
    },
    parentExternalKey: draft.parentExternalKey,
    version: draft.version,
    status: 'draft',
    source: 'manual',
    createdBy: userId,
    updatedBy: userId,
  });

  await recordPlanningAudit({
    organizationId: project.organizationId,
    actorUserId: userId,
    action: 'planning.artifact.forked',
    resourceId: doc._id,
    before: { artifactId: source._id, version: source.version, status: source.status },
    after: { version: doc.version, status: 'draft' },
    meta: { projectId: String(projectId), note: String(note || '').slice(0, 500) },
  });

  return serializeDoc(doc);
}

/**
 * RULE-22 — bulk dump Planning artifacts (draft).
 */
async function bulkDumpArtifacts({ userId, projectId, body = {} }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:artifact_edit' });
  const { parsePlanningDumpPayload } = require('../utils/planning/planningDumpParse');
  const parsed = parsePlanningDumpPayload(body);
  if (!parsed.rows.length) {
    const err = new Error(parsed.errors[0] || 'Không có dòng dump hợp lệ');
    err.statusCode = 400;
    err.errorCode = 'PLANNING_DUMP_EMPTY';
    err.details = parsed.errors;
    throw err;
  }

  const created = [];
  const skipped = [];
  for (const row of parsed.rows) {
    try {
      const item = await createArtifact({
        userId,
        projectId,
        body: {
          ...row,
          source: 'import',
        },
      });
      created.push(item);
    } catch (e) {
      skipped.push({
        externalKey: row.externalKey,
        kind: row.kind,
        message: e.message || 'skip',
        errorCode: e.code === 11000 ? 'DUPLICATE' : e.errorCode,
      });
    }
  }

  return {
    format: parsed.format,
    created: created.length,
    skipped: skipped.length,
    parseErrors: parsed.errors,
    items: created,
    skippedItems: skipped,
  };
}

module.exports = {
  listArtifacts,
  getArtifact,
  createArtifact,
  updateArtifact,
  transitionArtifact,
  bulkTransitionArtifacts,
  listBaselines,
  cutBaseline,
  suggestArtifacts,
  confirmSuggestions,
  publishWbsToDevelopment,
  planningSummary,
  forkArtifactVersion,
  bulkDumpArtifacts,
};
