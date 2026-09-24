const Project = require('../models/Project');
const PlanningArtifact = require('../models/PlanningArtifact');
const PlanningBaseline = require('../models/PlanningBaseline');
const {
  normalizePlanningKind,
  canTransitionPlanningStatus,
  permissionForPlanningTransition,
  isPlanningContentEditableStatus,
  isPlanningReviewNoteRequired,
  canResubmitPlanningFromChangesRequested,
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

/** Org members + profiles for Planning assignee soft-validate. */
async function loadOrgAssigneeDirectory(organizationId, actorUserId) {
  const { fetchOrganizationMemberships } = require('../clients/orgMemberships.client');
  const { fetchProfilesByUserIds } = require('../clients/userProfilesBatch.client');
  const memberships = await fetchOrganizationMemberships(organizationId, actorUserId);
  const userIds = memberships.map((m) => m.userId);
  const profiles = await fetchProfilesByUserIds(userIds);
  return userIds.map((userId) => {
    const p = profiles.get(userId) || {};
    return {
      userId,
      email: p.email || '',
      displayName: p.displayName || p.fullName || p.username || '',
      username: p.username || '',
    };
  });
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
  if (!isPlanningContentEditableStatus(doc.status)) {
    const err = new Error('Chỉ sửa được planning artifact draft / changes_requested / rejected');
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

function applyReviewStamp(doc, from, to, stamp, { techSkipped = false } = {}) {
  if (
    from === 'ba_review' &&
    (to === 'tech_review' ||
      to === 'pm_review' ||
      to === 'po_review' ||
      to === 'rejected' ||
      to === 'changes_requested')
  ) {
    doc.review.ba = stamp;
  }
  if (from === 'draft' && (to === 'pm_review' || to === 'ba_review')) {
    /* submit — no stamp yet */
  }
  if (
    from === 'tech_review' &&
    (to === 'pm_review' || to === 'po_review' || to === 'rejected' || to === 'changes_requested')
  ) {
    doc.review.tech = stamp;
  }
  if (
    from === 'pm_review' &&
    (to === 'tech_review' || to === 'po_review' || to === 'rejected' || to === 'changes_requested')
  ) {
    doc.review.pm = stamp;
  }
  if (from === 'po_review' && (to === 'approved' || to === 'rejected' || to === 'changes_requested')) {
    doc.review.po = stamp;
  }
  if (techSkipped && (to === 'po_review' || to === 'pm_review') && from !== 'tech_review') {
    doc.review.tech = doc.review.tech?.userId
      ? doc.review.tech
      : { skipped: true, at: new Date(), note: 'tech_optional_skip' };
  }
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

  const {
    projectHasPlanningTechReviewer,
    assertGateStampSoD,
    notifyNextGateReviewers,
  } = require('../utils/phase1GatePolicy');
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  const techRequired = await projectHasPlanningTechReviewer(projectId);

  // DEC D9: new submits go PM gate — ba_review only for legacy/admin bypass
  if (from === 'draft' && to === 'ba_review' && !bypass) {
    const err = new Error('DEC D9: gửi Planning qua pm_review (không qua cổng BA)');
    err.statusCode = 409;
    err.errorCode = 'PLANNING_BA_GATE_DISABLED';
    throw err;
  }

  if (from === 'changes_requested') {
    if (!canResubmitPlanningFromChangesRequested(from, to, doc.changesRequestedFrom) && !bypass) {
      const err = new Error(
        `Chỉ gửi lại về cổng ${doc.changesRequestedFrom || 'pm_review'} sau khi chỉnh sửa`
      );
      err.statusCode = 400;
      err.errorCode = 'PLANNING_RESUBMIT_GATE';
      throw err;
    }
  }

  if (isPlanningReviewNoteRequired(to) && !String(note || '').trim() && !bypass) {
    const err = new Error('Ghi chú bắt buộc khi yêu cầu chỉnh sửa hoặc từ chối');
    err.statusCode = 400;
    err.errorCode = 'PLANNING_NOTE_REQUIRED';
    throw err;
  }

  // DEC D9: skip forcing Tech when none; block skip when Tech exists
  if (
    (from === 'pm_review' || from === 'ba_review') &&
    to === 'tech_review' &&
    !techRequired &&
    !bypass
  ) {
    const err = new Error('Không có Tech Reviewer — chuyển thẳng po_review');
    err.statusCode = 409;
    err.errorCode = 'PLANNING_TECH_SKIP';
    throw err;
  }
  if (
    (from === 'pm_review' || from === 'ba_review') &&
    to === 'po_review' &&
    techRequired &&
    !bypass
  ) {
    const err = new Error('Có Tech Reviewer — phải qua tech_review');
    err.statusCode = 409;
    err.errorCode = 'PLANNING_TECH_REQUIRED';
    throw err;
  }

  const perm = permissionForPlanningTransition(from, to);
  if (perm && !bypass) {
    await assertPlanningPerm({ userId, projectId, permission: perm });
  }

  const prior = [];
  if (from === 'tech_review') prior.push(doc.review?.ba, doc.review?.pm);
  if (from === 'po_review') prior.push(doc.review?.ba, doc.review?.tech, doc.review?.pm);
  if (from === 'pm_review' && to === 'tech_review') prior.push(doc.review?.ba);
  assertGateStampSoD({ actorUserId: userId, priorStamps: prior, bypass });

  const beforeStatus = doc.status;
  const gateNote = String(note || '').trim().slice(0, 1000);
  const stamp = { userId, at: new Date(), note: gateNote };
  const techSkipped = !techRequired && (to === 'po_review' || to === 'pm_review') && from !== 'tech_review';
  applyReviewStamp(doc, from, to, stamp, { techSkipped });

  if (to === 'changes_requested') {
    doc.changesRequestedFrom = from;
    doc.rejectionReason = gateNote;
  }
  if (to === 'rejected') {
    doc.rejectionReason = gateNote || doc.rejectionReason;
    doc.changesRequestedFrom = '';
  }
  if (from === 'changes_requested' && (to === 'pm_review' || to === 'tech_review' || to === 'po_review')) {
    doc.changesRequestedFrom = '';
  }

  doc.status = to;
  doc.updatedBy = userId;
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

  let nextPermission = null;
  if (to === 'changes_requested') {
    nextPermission = null;
    try {
      const { notifySystemKind, projectHubActionUrl } = require('../clients/notification.client');
      const { userIdsWithProjectPermission } = require('../utils/phase1GatePolicy');
      const editors = await userIdsWithProjectPermission(projectId, 'planning:artifact_edit');
      const authorId = String(doc.createdBy || '').trim();
      const targets = [...new Set([...(editors || []), authorId].filter(Boolean))];
      if (targets.length) {
        await notifySystemKind({
          userIds: targets,
          kind: 'planning_changes_requested',
          title: 'Yêu cầu chỉnh sửa Planning',
          content: `Planning “${String(doc.title || doc.externalKey || '').trim() || '—'}” cần chỉnh sửa: ${gateNote.slice(0, 200)}`,
          data: {
            projectId: String(projectId),
            organizationId: String(doc.organizationId || ''),
            artifactId: String(doc._id),
            kind: 'planning_changes_requested',
            returnTo: from,
          },
          actionUrl: projectHubActionUrl({
            projectId,
            organizationId: doc.organizationId,
            pathSuffix: 'planning/approval',
          }),
          excludeUserId: userId,
        });
      }
    } catch {
      /* non-blocking */
    }
  } else if (to === 'tech_review') nextPermission = 'planning:tech_review';
  else if (to === 'pm_review' && techRequired && from !== 'changes_requested') {
    nextPermission = 'planning:tech_review';
  } else if (to === 'pm_review' && !techRequired) nextPermission = 'planning:po_review';
  else if (to === 'po_review') nextPermission = 'planning:po_review';

  if (nextPermission) {
    await notifyNextGateReviewers({
      projectId,
      organizationId: doc.organizationId,
      actorUserId: userId,
      nextPermission,
      title: 'Planning chờ duyệt',
      content: `Planning “${String(doc.title || doc.externalKey || '').trim() || '—'}” chờ cổng tiếp theo.`,
      kind: 'planning_gate_pending',
      actionPath: 'planning/approval',
    });
  }

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
async function suggestArtifacts({ userId, projectId, kind, view }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:view' });

  const kindRaw = String(kind || '')
    .trim()
    .toUpperCase();
  if (kindRaw === 'WORK_ITEM') {
    return suggestWorkItemSuggestions({ projectId, project, view });
  }

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

  const sliced = suggestions.slice(0, 80);
  let assigneeReport = null;
  try {
    const { reportAssigneeHints } = require('../utils/planning/planningAssigneeResolve');
    const members = await loadOrgAssigneeDirectory(project.organizationId, userId);
    assigneeReport = reportAssigneeHints(sliced, members);
  } catch {
    assigneeReport = null;
  }

  return {
    jobId: null,
    status: 'ready',
    kind: k,
    suggestions: sliced,
    assigneeReport: assigneeReport
      ? {
          summary: assigneeReport.summary,
          unresolved: assigneeReport.unresolved.slice(0, 40),
          ambiguous: assigneeReport.ambiguous.slice(0, 20),
        }
      : null,
    message:
      sliced.length > 0
        ? `Gợi ý ${sliced.length} mục (heuristic HITL) — xác nhận từng dòng để tạo artifact`
        : 'Không có gợi ý mới (đã có artifact hoặc chưa có SRS approved)',
    projectId: String(projectId),
    organizationId: String(project.organizationId || ''),
  };
}

async function confirmSuggestions({ userId, projectId, suggestions = [], kind, view }) {
  const kindRaw = String(kind || suggestions?.[0]?.kind || '')
    .trim()
    .toUpperCase();
  if (kindRaw === 'WORK_ITEM') {
    return confirmWorkItemSuggestions({ userId, projectId, suggestions, view });
  }

  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:artifact_edit' });
  const list = Array.isArray(suggestions) ? suggestions : [];
  const working = list.slice(0, 50).map((s) => ({
    kind: s.kind,
    externalKey: s.externalKey,
    title: s.title,
    summary: s.summary,
    structured:
      s.structured && typeof s.structured === 'object' ? { ...s.structured } : {},
  }));
  let assigneeReport = null;
  try {
    const { applyAssigneeResolution } = require('../utils/planning/planningAssigneeResolve');
    const members = await loadOrgAssigneeDirectory(project.organizationId, userId);
    assigneeReport = applyAssigneeResolution(working, members);
  } catch {
    assigneeReport = null;
  }
  const created = [];
  const skipped = [];
  for (const s of working) {
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
  return {
    created: created.length,
    skipped,
    items: created,
    assigneeReport: assigneeReport
      ? {
          summary: assigneeReport.summary,
          unresolved: assigneeReport.unresolved.slice(0, 40),
          ambiguous: assigneeReport.ambiguous.slice(0, 20),
        }
      : null,
  };
}

/**
 * P2-A/B — suggest Task cards under published epics (no DB write).
 */
async function suggestWorkItemSuggestions({ projectId, project, view }) {
  const { suggestWorkItems } = require('../utils/planning/suggestWorkItems');
  const PlanningItem = require('../models/PlanningItem');
  const Task = require('../models/Task');
  const AnalysisArtifact = require('../models/AnalysisArtifact');

  const resolvedView = String(view || 'from_wbs')
    .trim()
    .toLowerCase() === 'from_uc_gap'
    ? 'from_uc_gap'
    : 'from_wbs';

  const [wbsArtifacts, epics, existingTasks, frs, useCases] = await Promise.all([
    PlanningArtifact.find({
      projectId,
      kind: 'WBS',
      isActive: true,
    })
      .select('title summary externalKey status structured publishedWorkItemId')
      .lean(),
    PlanningItem.find({
      projectId,
      type: 'epic',
      isActive: { $ne: false },
    })
      .select('title type sourceArtifactId')
      .lean(),
    Task.find({
      projectId,
      isActive: true,
      $or: [
        { sourceWbsArtifactId: { $ne: null } },
        { sourceUcKey: { $nin: [null, ''] } },
      ],
    })
      .select('sourceWbsArtifactId sourceUcKey sourceFrKey')
      .lean(),
    AnalysisArtifact.find({
      projectId,
      kind: 'FR',
      status: 'approved',
      isActive: true,
    })
      .select('externalKey title summary')
      .lean(),
    resolvedView === 'from_uc_gap'
      ? AnalysisArtifact.find({
          projectId,
          kind: 'UC',
          status: 'approved',
          isActive: true,
        })
          .select('externalKey title summary structured status')
          .limit(80)
          .lean()
      : Promise.resolve([]),
  ]);

  const frByKey = new Map();
  for (const fr of frs) {
    const key = String(fr.externalKey || '').trim();
    if (key) frByKey.set(key, fr);
  }

  const result = suggestWorkItems({
    view: resolvedView,
    wbsArtifacts,
    epics,
    existingTasks,
    frByKey,
    useCases,
  });

  const sliced = (result.suggestions || []).slice(0, 50);
  return {
    jobId: `wi-suggest-${Date.now()}`,
    status: 'ready',
    kind: 'WORK_ITEM',
    view: result.view,
    suggestions: sliced,
    skippedHints: (result.skippedHints || []).slice(0, 40),
    message: sliced.length
      ? `Gợi ý ${sliced.length} task (HITL) — xác nhận để tạo thẻ dưới Epic`
      : 'Không có gợi ý task (chưa publish WBS, đã có task, hoặc không còn UC gap)',
    projectId: String(projectId),
    organizationId: String(project.organizationId || ''),
  };
}

/**
 * P2 confirm — tạo Task dưới Epic; cần task:create.
 */
async function confirmWorkItemSuggestions({ userId, projectId, suggestions = [] }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  if (isProjectRbacV2Enabled()) {
    await assertUserProjectPermission({
      userId,
      projectId,
      permission: 'task:create',
      message: 'Thiếu quyền task:create để tạo thẻ từ gợi ý',
    });
  }

  const TaskBoard = require('../models/TaskBoard');
  const TaskBoardList = require('../models/TaskBoardList');
  const PlanningItem = require('../models/PlanningItem');
  const Task = require('../models/Task');
  const taskBoardService = require('./taskBoard.service');

  const board = await TaskBoard.findOne({ projectId, isActive: true }).sort({ createdAt: 1 }).lean();
  if (!board) {
    const err = new Error('Project chưa có board — tạo board trước khi confirm task');
    err.statusCode = 400;
    err.errorCode = 'BOARD_REQUIRED';
    throw err;
  }

  let list =
    (await TaskBoardList.findOne({
      boardId: board._id,
      isArchived: false,
      isDefault: true,
    }).lean()) ||
    (await TaskBoardList.findOne({
      boardId: board._id,
      isArchived: false,
      statusKey: { $in: ['todo', 'open'] },
    })
      .sort({ order: 1 })
      .lean()) ||
    (await TaskBoardList.findOne({ boardId: board._id, isArchived: false }).sort({ order: 1 }).lean());

  if (!list) {
    const err = new Error('Board chưa có cột (list) — thêm cột Todo trước');
    err.statusCode = 400;
    err.errorCode = 'BOARD_LIST_REQUIRED';
    throw err;
  }

  const listIn = Array.isArray(suggestions) ? suggestions : [];
  const working = listIn.slice(0, 50);
  const created = [];
  const skipped = [];

  for (const s of working) {
    const epicId = String(s.epicId || '').trim();
    const title = String(s.title || '').trim();
    const sourceWbsArtifactId = s.sourceWbsArtifactId
      ? String(s.sourceWbsArtifactId).trim()
      : '';
    const sourceUcKey = String(s.sourceUcKey || '').trim();
    const sourceFrKey = String(s.sourceFrKey || '').trim();

    if (!epicId || !title) {
      skipped.push({
        key: s.key,
        message: 'Thiếu epicId hoặc title',
        errorCode: 'INVALID_SUGGESTION',
      });
      continue;
    }

    const epic = await PlanningItem.findOne({
      _id: epicId,
      projectId,
      type: 'epic',
    }).lean();
    if (!epic) {
      skipped.push({
        key: s.key,
        epicId,
        message: 'Epic không thuộc project',
        errorCode: 'EPIC_INVALID',
      });
      continue;
    }

    if (sourceWbsArtifactId) {
      const dup = await Task.findOne({
        projectId,
        isActive: true,
        sourceWbsArtifactId,
      })
        .select('_id title')
        .lean();
      if (dup) {
        skipped.push({
          key: s.key,
          sourceWbsArtifactId,
          message: 'Đã có task từ WBS này',
          errorCode: 'DUP_WBS',
          existingId: String(dup._id),
        });
        continue;
      }
    }
    if (sourceUcKey) {
      const dupUc = await Task.findOne({
        projectId,
        isActive: true,
        sourceUcKey,
      })
        .select('_id title')
        .lean();
      if (dupUc) {
        skipped.push({
          key: s.key,
          sourceUcKey,
          message: 'Đã có task từ UC này',
          errorCode: 'DUP_UC',
          existingId: String(dupUc._id),
        });
        continue;
      }
    }

    try {
      const card = await taskBoardService.createCard({
        userId,
        boardId: board._id,
        listId: list._id,
        title: title.slice(0, 240),
        summary: String(s.summary || '').slice(0, 2000),
        epicId: epic._id,
        issueType: s.issueType === 'task' || s.issueType === 'bug' ? s.issueType : 'story',
        sourceWbsArtifactId: sourceWbsArtifactId || null,
        sourceFrKey: sourceFrKey || '',
        sourceUcKey: sourceUcKey || '',
      });
      created.push({
        id: String(card._id || card.id),
        title: card.title,
        epicId: String(epic._id),
      });
    } catch (e) {
      skipped.push({
        key: s.key,
        message: e.message || 'create failed',
        errorCode: e.errorCode || e.code,
      });
    }
  }

  return {
    created: created.length,
    skipped,
    items: created,
    kind: 'WORK_ITEM',
    projectId: String(projectId),
    organizationId: String(project.organizationId || ''),
  };
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

/**
 * DEC D1 — after publish WBS epics, materialize board Tasks from WBS leaves (HITL-free on advance).
 */
async function seedBoardTasksFromPublishedWbs({ userId, projectId }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  const Task = require('../models/Task');
  const PlanningItem = require('../models/PlanningItem');
  const AnalysisArtifact = require('../models/AnalysisArtifact');

  const wbsAll = await PlanningArtifact.find({
    projectId,
    kind: 'WBS',
    status: 'approved',
    isActive: true,
  }).lean();

  const usedAsParent = new Set(
    wbsAll.map((w) => String(w.parentExternalKey || '').trim()).filter(Boolean)
  );
  const leaves = wbsAll.filter((w) => {
    const key = String(w.externalKey || '').trim();
    if (!key) return true;
    return !usedAsParent.has(key);
  });

  if (!leaves.length) {
    return {
      created: 0,
      skipped: [],
      leafCount: 0,
      errorCode: 'NO_WBS_LEAVES',
      message: 'Không có WBS leaf approved để seed Task',
    };
  }

  // Ensure every leaf has publishedWorkItemId (epic) — publish any missing first
  const unpublished = leaves.filter((w) => !w.publishedWorkItemId);
  if (unpublished.length) {
    await publishWbsToDevelopment({ userId, projectId });
    const refreshed = await PlanningArtifact.find({
      projectId,
      kind: 'WBS',
      status: 'approved',
      isActive: true,
    }).lean();
    const byId = new Map(refreshed.map((r) => [String(r._id), r]));
    for (let i = 0; i < leaves.length; i += 1) {
      const id = String(leaves[i]._id);
      if (byId.has(id)) leaves[i] = byId.get(id);
    }
  }

  const epics = await PlanningItem.find({ projectId, type: 'epic', isActive: { $ne: false } }).lean();
  const existingTasks = await Task.find({ projectId, isActive: true })
    .select('sourceWbsArtifactId sourceUcKey title')
    .lean();
  const frRows = await AnalysisArtifact.find({
    projectId,
    kind: 'FR',
    isActive: true,
  })
    .select('externalKey title summary')
    .lean();
  const frByKey = new Map(frRows.map((f) => [String(f.externalKey || '').trim(), f]));

  const { suggestWorkItemsFromWbs } = require('../utils/planning/suggestWorkItems');
  const { suggestions } = suggestWorkItemsFromWbs({
    wbsArtifacts: leaves,
    epics,
    frByKey,
    existingTasks,
  });

  if (!suggestions.length) {
    const already = existingTasks.filter((t) => t.sourceWbsArtifactId).length;
    return {
      created: 0,
      skipped: [],
      leafCount: leaves.length,
      existingFromWbs: already,
      message: already
        ? 'Task từ WBS đã có sẵn'
        : 'Không tạo được suggestion — kiểm tra epic publish',
    };
  }

  const result = await confirmWorkItemSuggestions({
    userId,
    projectId,
    suggestions,
  });
  return {
    ...result,
    leafCount: leaves.length,
    organizationId: String(project.organizationId || ''),
  };
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
      requiredDraftOnly: readiness.requiredDraftOnly,
      requiredAbsent: readiness.requiredAbsent,
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
 * DEC D-WB4: dryRun=true → validate + preview, no DB writes.
 */
async function bulkDumpArtifacts({ userId, projectId, body = {} }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:artifact_edit' });
  const { parsePlanningDumpPayload } = require('../utils/planning/planningDumpParse');
  const parsed = parsePlanningDumpPayload(body);
  const dryRun =
    body.dryRun === true || body.dryRun === 'true' || body.dryRun === 1 || body.dryRun === '1';

  const parseErrors = Array.isArray(parsed.errors) ? parsed.errors : [];
  const structuredErrors = parseErrors.map((e) =>
    typeof e === 'object' && e
      ? e
      : { sheet: '', row: 0, code: 'PARSE', message: String(e) }
  );

  if (!parsed.rows.length) {
    if (dryRun) {
      return {
        dryRun: true,
        format: parsed.format || 'unknown',
        created: 0,
        skipped: 0,
        wouldCreate: 0,
        wouldSkip: 0,
        errors: structuredErrors,
        parseErrors: structuredErrors,
        preview: [],
        meta: parsed.meta || null,
      };
    }
    const err = new Error(structuredErrors[0]?.message || 'Không có dòng dump hợp lệ');
    err.statusCode = 400;
    err.errorCode = 'PLANNING_DUMP_EMPTY';
    err.details = structuredErrors;
    throw err;
  }

  let assigneeReport = null;
  try {
    const { applyAssigneeResolution } = require('../utils/planning/planningAssigneeResolve');
    const members = await loadOrgAssigneeDirectory(project.organizationId, userId);
    assigneeReport = applyAssigneeResolution(parsed.rows, members);
  } catch {
    assigneeReport = null;
  }

  const existing = await PlanningArtifact.find({ projectId, isActive: true })
    .select('kind externalKey')
    .lean();
  const existingKeys = new Set(existing.map((a) => `${a.kind}:${a.externalKey}`));

  const previewRow = (row) => ({
    kind: row.kind,
    externalKey: row.externalKey,
    title: row.title,
    summary: row.summary ? String(row.summary).slice(0, 200) : '',
    parentExternalKey: row.parentExternalKey || '',
    sheet: row._sheet || '',
    row: row._row || 0,
    duplicate: existingKeys.has(`${row.kind}:${row.externalKey}`),
  });

  if (dryRun) {
    const wouldCreate = [];
    const wouldSkip = [];
    for (const row of parsed.rows) {
      const key = `${row.kind}:${row.externalKey}`;
      if (existingKeys.has(key)) {
        wouldSkip.push({
          externalKey: row.externalKey,
          kind: row.kind,
          message: 'Đã tồn tại',
          errorCode: 'DUPLICATE',
        });
      } else {
        wouldCreate.push(previewRow(row));
        existingKeys.add(key);
      }
    }
    return {
      dryRun: true,
      format: parsed.format,
      created: 0,
      skipped: wouldSkip.length,
      wouldCreate: wouldCreate.length,
      wouldSkip: wouldSkip.length,
      errors: structuredErrors,
      parseErrors: structuredErrors,
      preview: wouldCreate.slice(0, 100),
      skippedItems: wouldSkip.slice(0, 100),
      meta: parsed.meta || null,
      assigneeReport: assigneeReport
        ? {
            summary: assigneeReport.summary,
            unmatchedHints: [
              ...assigneeReport.unresolved.slice(0, 30),
              ...assigneeReport.ambiguous.slice(0, 20),
            ],
          }
        : null,
    };
  }

  const created = [];
  const skipped = [];
  for (const row of parsed.rows) {
    try {
      const { _sheet, _row, ...payload } = row;
      const item = await createArtifact({
        userId,
        projectId,
        body: {
          ...payload,
          source: 'import',
        },
      });
      created.push(item);
    } catch (e) {
      skipped.push({
        externalKey: row.externalKey,
        kind: row.kind,
        sheet: row._sheet || '',
        row: row._row || 0,
        message: e.message || 'skip',
        errorCode: e.code === 11000 ? 'DUPLICATE' : e.errorCode,
      });
    }
  }

  return {
    dryRun: false,
    format: parsed.format,
    created: created.length,
    skipped: skipped.length,
    errors: structuredErrors,
    parseErrors: structuredErrors,
    items: created,
    skippedItems: skipped,
    assigneeReport: assigneeReport
      ? {
          summary: assigneeReport.summary,
          unmatchedHints: [
            ...assigneeReport.unresolved.slice(0, 30),
            ...assigneeReport.ambiguous.slice(0, 20),
          ],
          unresolved: assigneeReport.unresolved.slice(0, 40),
          ambiguous: assigneeReport.ambiguous.slice(0, 20),
          matched: assigneeReport.matched.slice(0, 40),
        }
      : null,
  };
}

/**
 * Multi-sheet Planning workbook template (optional RA seed — DEC D-WB2).
 */
async function buildDumpWorkbookTemplate({ userId, projectId, seedFromRa = false }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertPlanningPerm({ userId, projectId, permission: 'planning:artifact_edit' });

  let seed = null;
  if (seedFromRa) {
    const existing = await PlanningArtifact.find({ projectId, isActive: true })
      .select('kind externalKey')
      .lean();
    const existingKeys = new Set(existing.map((a) => `${a.kind}:${a.externalKey}`));

    let frs = [];
    let nfrs = [];
    let assumptions = [];
    try {
      const AnalysisArtifact = require('../models/AnalysisArtifact');
      frs = await AnalysisArtifact.find({
        projectId,
        kind: 'FR',
        status: 'approved',
        isActive: true,
      })
        .select('externalKey title summary')
        .limit(40)
        .lean();
      nfrs = await AnalysisArtifact.find({
        projectId,
        kind: 'NFR',
        status: 'approved',
        isActive: true,
        'structured.category': { $regex: /^constraint$/i },
      })
        .select('externalKey title summary structured')
        .limit(20)
        .lean();
    } catch {
      frs = [];
      nfrs = [];
    }
    try {
      const RequirementPack = require('../models/RequirementPack');
      const pack = await RequirementPack.findOne({
        projectId,
        status: { $in: ['ACTIVE', 'active', 'approved', 'APPROVED'] },
      })
        .select('assumptions')
        .lean();
      assumptions = Array.isArray(pack?.assumptions) ? pack.assumptions : [];
    } catch {
      assumptions = [];
    }

    const { buildSeedMapsFromRa } = require('../utils/planning/planningWorkbookBuilder');
    seed = buildSeedMapsFromRa({ frs, nfrs, assumptions, existingKeys });
  }

  const { buildPlanningWorkbookBuffer } = require('../utils/planning/planningWorkbookBuilder');
  return buildPlanningWorkbookBuffer({
    project,
    seedFromRa: Boolean(seedFromRa),
    seed: seed || undefined,
  });
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
  seedBoardTasksFromPublishedWbs,
  planningSummary,
  forkArtifactVersion,
  bulkDumpArtifacts,
  buildDumpWorkbookTemplate,
};
