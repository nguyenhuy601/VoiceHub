const crypto = require('crypto');
const Project = require('../models/Project');
const CustomerDocument = require('../models/CustomerDocument');
const AnalysisArtifact = require('../models/AnalysisArtifact');
const ArtifactTraceLink = require('../models/ArtifactTraceLink');
const SrsBaseline = require('../models/SrsBaseline');
const {
  normalizeArtifactKind,
  PO_AUTHOR_KINDS,
  ANALYSIS_ARTIFACT_SOURCES,
  ARTIFACT_TRACE_LINK_TYPES,
  CUSTOMER_DOC_CLASSES,
  canTransitionArtifactStatus,
  permissionForArtifactTransition,
} = require('../constants/analysisArtifact');
const {
  isProjectRbacV2Enabled,
  hasPermission,
} = require('../utils/project/projectPermissionMatrix');
const { assertUserProjectPermission, assertUserAnyProjectPermission } =
  require('./projectAccess.service');
const { clampOverviewForPack } = require('../utils/requirement/requirementOverviewClamp');
const {
  isPhase1SetGateEnabled,
} = require('../constants/analysisImportSet');
const {
  resolveArtifactDraftUpdate,
} = require('../constants/analysisArtifactFieldCatalog');

function hashContent(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 40);
}

async function assertProjectMemberAccess({ userId, projectId }) {
  const project = await Project.findById(projectId).lean();
  if (!project || project.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return project;
}

async function assertAnalysisPerm({ userId, projectId, permission, message }) {
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

async function listCustomerDocuments({ userId, projectId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:view',
  });
  const rows = await CustomerDocument.find({ projectId, isActive: true })
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(serializeDoc);
}

async function createCustomerDocument({ userId, projectId, body = {} }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:document_upload',
  });
  const filename = String(body.filename || '').trim();
  if (!filename) {
    const err = new Error('filename là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const docClass = CUSTOMER_DOC_CLASSES.includes(String(body.docClass || '').trim())
    ? String(body.docClass).trim()
    : 'other';
  const doc = await CustomerDocument.create({
    organizationId: project.organizationId,
    projectId,
    filename,
    mimeType: String(body.mimeType || '').trim().slice(0, 120),
    storageKey: String(body.storageKey || '').trim().slice(0, 512),
    sizeBytes: body.sizeBytes != null ? Number(body.sizeBytes) : null,
    docClass,
    notes: String(body.notes || '').trim().slice(0, 2000),
    uploadedBy: userId,
  });
  return serializeDoc(doc);
}

async function listArtifacts({ userId, projectId, kind, status }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({ userId, projectId, permission: 'analysis:view' });
  const filter = { projectId, isActive: true };
  const k = normalizeArtifactKind(kind);
  if (k) filter.kind = k;
  if (status) filter.status = String(status).trim().toLowerCase();
  const rows = await AnalysisArtifact.find(filter).sort({ kind: 1, externalKey: 1, version: -1 }).lean();
  return rows.map(serializeDoc);
}

async function getArtifact({ userId, projectId, artifactId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({ userId, projectId, permission: 'analysis:view' });
  const row = await AnalysisArtifact.findOne({ _id: artifactId, projectId, isActive: true }).lean();
  if (!row) {
    const err = new Error('Artifact không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return serializeDoc(row);
}

function assertCanAuthorKind({ permissions, kind, isBypass }) {
  if (isBypass) return;
  const k = normalizeArtifactKind(kind);
  const canImport = hasPermission(permissions, 'analysis:artifact_import');
  const canEdit = hasPermission(permissions, 'analysis:artifact_edit');
  if (!canImport && !canEdit) {
    const err = new Error('Không có quyền tạo/sửa analysis artifact');
    err.statusCode = 403;
    throw err;
  }
  // PO without full BA import: only BG/SCOPE (still has artifact_import in matrix)
  // Enforced softly: if user has ba_review they are BA; PO_AUTHOR kinds always ok for import holders
  if (PO_AUTHOR_KINDS.includes(k)) return;
  if (!hasPermission(permissions, 'analysis:submit_ba_review') && !hasPermission(permissions, 'analysis:ba_review')) {
    // PO-only: block non BG/SCOPE
    if (hasPermission(permissions, 'analysis:po_review') && !hasPermission(permissions, 'analysis:ba_review')) {
      const err = new Error('PO chỉ được tạo/sửa BG và SCOPE');
      err.statusCode = 403;
      throw err;
    }
  }
}

async function createArtifact({ userId, projectId, body = {} }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  if (!bypass) {
    await assertUserAnyProjectPermission({
      userId,
      projectId,
      permissions: ['analysis:artifact_import', 'analysis:artifact_edit'],
      message: 'Không có quyền import/sửa artifact',
    });
  }
  const kind = normalizeArtifactKind(body.kind);
  if (!kind) {
    const err = new Error('kind không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  assertCanAuthorKind({ permissions: resolved.permissions, kind, isBypass: bypass });

  const externalKey = String(body.externalKey || '').trim().slice(0, 64);
  const title = String(body.title || '').trim().slice(0, 240);
  if (!externalKey || !title) {
    const err = new Error('externalKey và title là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const source = ANALYSIS_ARTIFACT_SOURCES.includes(String(body.source || '').trim())
    ? String(body.source).trim()
    : 'manual';
  const structured = body.structured && typeof body.structured === 'object' ? body.structured : {};
  const contentHash = hashContent({ kind, externalKey, title, structured, body: body.body });

  try {
    const doc = await AnalysisArtifact.create({
      organizationId: project.organizationId,
      projectId,
      kind,
      externalKey,
      title,
      summary: String(body.summary || '').trim().slice(0, 2000),
      body: String(body.body || '').trim().slice(0, 20000),
      structured,
      source,
      sourceDocumentId: body.sourceDocumentId || null,
      sourcePackId: body.sourcePackId || null,
      version: Number(body.version) > 0 ? Math.round(Number(body.version)) : 1,
      status: 'draft',
      createdBy: userId,
      updatedBy: userId,
      contentHash,
    });
    return serializeDoc(doc);
  } catch (e) {
    if (e && e.code === 11000) {
      const err = new Error('Artifact key/version đã tồn tại');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
}

async function updateArtifactDraft({ userId, projectId, artifactId, body = {} }) {
  await assertProjectMemberAccess({ userId, projectId });
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  if (!bypass) {
    await assertAnalysisPerm({
      userId,
      projectId,
      permission: 'analysis:artifact_edit',
    });
  }
  const doc = await AnalysisArtifact.findOne({ _id: artifactId, projectId, isActive: true });
  if (!doc) {
    const err = new Error('Artifact không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (!['draft', 'rejected'].includes(doc.status)) {
    const err = new Error('Chỉ sửa được artifact draft/rejected');
    err.statusCode = 400;
    err.errorCode = 'STATUS_NOT_EDITABLE';
    throw err;
  }
  assertCanAuthorKind({
    permissions: resolved.permissions,
    kind: doc.kind,
    isBypass: bypass,
  });

  /** Wave 2 — whitelist field theo catalog (FR/UC); kind khác giữ legacy. */
  const resolvedUpdate = resolveArtifactDraftUpdate({
    kind: doc.kind,
    status: doc.status,
    body,
    existingStructured: doc.structured && typeof doc.structured === 'object' ? doc.structured : {},
    strictUnknown: false,
  });

  if (resolvedUpdate.top?.title !== undefined) {
    doc.title = String(resolvedUpdate.top.title || '').trim().slice(0, 240);
  }
  if (resolvedUpdate.top?.summary !== undefined) {
    doc.summary = String(resolvedUpdate.top.summary || '').trim().slice(0, 2000);
  }
  if (resolvedUpdate.top?.body !== undefined) {
    doc.body = String(resolvedUpdate.top.body || '').trim().slice(0, 20000);
  }
  if (resolvedUpdate.structured !== undefined) {
    doc.structured = resolvedUpdate.structured;
    doc.markModified('structured');
  }
  if (doc.status === 'rejected' && resolvedUpdate.reopen === true) {
    doc.status = 'draft';
    doc.rejectionReason = '';
  }
  doc.updatedBy = userId;
  doc.contentHash = hashContent({
    kind: doc.kind,
    externalKey: doc.externalKey,
    title: doc.title,
    structured: doc.structured,
    body: doc.body,
  });
  await doc.save();
  return serializeDoc(doc);
}

async function transitionArtifactStatus({
  userId,
  projectId,
  artifactId,
  toStatus,
  note = '',
}) {
  await assertProjectMemberAccess({ userId, projectId });
  const doc = await AnalysisArtifact.findOne({ _id: artifactId, projectId, isActive: true });
  if (!doc) {
    const err = new Error('Artifact không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const from = doc.status;
  const to = String(toStatus || '')
    .trim()
    .toLowerCase();
  if (!canTransitionArtifactStatus(from, to)) {
    const err = new Error(`Không chuyển được ${from} → ${to}`);
    err.statusCode = 400;
    err.errorCode = 'ARTIFACT_TRANSITION_DENIED';
    throw err;
  }
  const perm = permissionForArtifactTransition(from, to);
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  if (!bypass && perm) {
    await assertAnalysisPerm({ userId, projectId, permission: perm });
  }
  // RULE-11: author cannot ba_review own artifact
  if (to === 'tech_review' && from === 'ba_review') {
    if (String(doc.createdBy) === String(userId) && !bypass) {
      const err = new Error('Không được BA review artifact do chính mình tạo');
      err.statusCode = 403;
      err.errorCode = 'ARTIFACT_FOUR_EYES';
      throw err;
    }
  }
  if (from === 'ba_review' && to === 'rejected') {
    if (String(doc.createdBy) === String(userId) && !bypass) {
      const err = new Error('Không được BA review artifact do chính mình tạo');
      err.statusCode = 403;
      throw err;
    }
  }

  const gateNote = String(note || '').trim().slice(0, 1000);
  const stamp = { userId, at: new Date(), note: gateNote };
  if (from === 'ba_review' && (to === 'tech_review' || to === 'rejected')) {
    doc.review.ba = stamp;
  }
  if (from === 'tech_review' && (to === 'po_review' || to === 'rejected')) {
    doc.review.tech = stamp;
  }
  if (from === 'po_review' && (to === 'approved' || to === 'rejected')) {
    doc.review.po = stamp;
  }
  if (to === 'rejected') {
    doc.rejectionReason = gateNote || doc.rejectionReason;
  }
  doc.status = to;
  doc.updatedBy = userId;
  await doc.save();
  return serializeDoc(doc);
}

async function createTraceLink({ userId, projectId, body = {} }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:manage_trace',
  });
  const linkType = String(body.linkType || '')
    .trim()
    .toLowerCase();
  if (!ARTIFACT_TRACE_LINK_TYPES.includes(linkType)) {
    const err = new Error('linkType không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const fromArtifactId = body.fromArtifactId;
  const toArtifactId = body.toArtifactId;
  if (!fromArtifactId || !toArtifactId) {
    const err = new Error('fromArtifactId và toArtifactId là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const [from, to] = await Promise.all([
    AnalysisArtifact.findOne({ _id: fromArtifactId, projectId, isActive: true }).lean(),
    AnalysisArtifact.findOne({ _id: toArtifactId, projectId, isActive: true }).lean(),
  ]);
  if (!from || !to) {
    const err = new Error('Artifact nguồn/đích không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  try {
    const link = await ArtifactTraceLink.create({
      organizationId: project.organizationId,
      projectId,
      fromArtifactId,
      toArtifactId,
      linkType,
      createdBy: userId,
    });
    return serializeDoc(link);
  } catch (e) {
    if (e && e.code === 11000) {
      const err = new Error('Trace link đã tồn tại');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
}

async function listTraceLinks({ userId, projectId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({ userId, projectId, permission: 'analysis:view' });
  const rows = await ArtifactTraceLink.find({ projectId, isActive: true }).lean();
  return rows.map(serializeDoc);
}

async function computeGapReport({ userId, projectId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({ userId, projectId, permission: 'analysis:view' });
  const [artifacts, links] = await Promise.all([
    AnalysisArtifact.find({ projectId, isActive: true }).lean(),
    ArtifactTraceLink.find({ projectId, isActive: true }).lean(),
  ]);
  const byKind = (k) => artifacts.filter((a) => a.kind === k);
  const frReqs = byKind('FR').filter(
    (a) => String(a.structured?.level || '').toLowerCase() === 'requirement'
  );
  const ucs = byKind('UC');
  const brs = byKind('BR');
  const bgs = byKind('BG');
  const frIds = new Set(frReqs.map((a) => String(a._id)));
  const ucCovers = new Set();
  for (const link of links) {
    if (link.linkType !== 'implements') continue;
    const from = artifacts.find((a) => String(a._id) === String(link.fromArtifactId));
    const to = artifacts.find((a) => String(a._id) === String(link.toArtifactId));
    if (from?.kind === 'UC' && to?.kind === 'FR') ucCovers.add(String(to._id));
  }
  // Also structured.relatedFrKeys on UC
  for (const uc of ucs) {
    const keys = Array.isArray(uc.structured?.relatedFrKeys) ? uc.structured.relatedFrKeys : [];
    for (const key of keys) {
      const fr = frReqs.find((f) => f.externalKey === key);
      if (fr) ucCovers.add(String(fr._id));
    }
  }
  const frMissingUc = frReqs.filter((f) => !ucCovers.has(String(f._id)));
  const brMissingBg = brs.filter((br) => {
    const has = links.some(
      (l) =>
        l.linkType === 'derives' &&
        String(l.fromArtifactId) === String(br._id) &&
        bgs.some((bg) => String(bg._id) === String(l.toArtifactId))
    );
    return !has;
  });
  const criticalGaps = [];
  if (!byKind('SCOPE').some((s) => String(s.structured?.scopeType || '').toLowerCase() === 'in' || s.structured?.scopeType === 'in')) {
    // also accept scopeType in
    const hasIn = byKind('SCOPE').some((s) => {
      const t = String(s.structured?.scopeType || '').toLowerCase();
      return t === 'in' || t === 'in scope';
    });
    if (!hasIn) criticalGaps.push({ code: 'NO_IN_SCOPE', message: 'Chưa có dòng In-Scope' });
  }

  const project = await Project.findById(projectId).select('deliveryPhase phase1RequiredKinds').lean();
  const { evaluateReadyForPhase2, evaluateRaReadiness } = require('../constants/phase2Gate');
  const { coerceDeliveryPhase } = require('../constants/projectDeliveryPhase');

  let srsBaselineExists = false;
  let planningBaselineExists = false;
  let planningSummary = null;
  try {
    const SrsBaseline = require('../models/SrsBaseline');
    const srsCount = await SrsBaseline.countDocuments({ projectId, isActive: true });
    srsBaselineExists = srsCount > 0;
  } catch {
    srsBaselineExists = false;
  }
  try {
    const PlanningBaseline = require('../models/PlanningBaseline');
    const planCount = await PlanningBaseline.countDocuments({ projectId, isActive: true });
    planningBaselineExists = planCount > 0;
    const PlanningArtifact = require('../models/PlanningArtifact');
    const { PLANNING_ARTIFACT_KINDS } = require('../constants/planningArtifact');
    const planArts = await PlanningArtifact.find({ projectId, isActive: true }).lean();
    const byKind = {};
    for (const k of PLANNING_ARTIFACT_KINDS) {
      const ofKind = planArts.filter((a) => a.kind === k);
      byKind[k] = {
        total: ofKind.length,
        approved: ofKind.filter((a) => a.status === 'approved').length,
        draft: ofKind.filter((a) => a.status === 'draft').length,
      };
    }
    planningSummary = { byKind, planningBaselineExists, baselineCount: planCount };
  } catch {
    planningBaselineExists = false;
  }

  const requiredKinds = Array.isArray(project?.phase1RequiredKinds)
    ? project.phase1RequiredKinds
    : [];
  const readiness = evaluateReadyForPhase2({
    deliveryPhase: coerceDeliveryPhase(project?.deliveryPhase),
    artifacts,
    criticalGapCount: criticalGaps.length,
    requiredKinds,
    srsBaselineExists,
    planningBaselineExists,
  });
  const ra = evaluateRaReadiness({
    artifacts,
    criticalGapCount: criticalGaps.length,
    requiredKinds,
  });

  const { constraints, assumptions } = await collectConstraintsAssumptions({
    projectId,
    artifacts,
  });

  return {
    counts: {
      BG: bgs.length,
      BR: brs.length,
      BPM: byKind('BPM').length,
      FR: byKind('FR').length,
      UC: ucs.length,
      NFR: byKind('NFR').length,
      SCOPE: byKind('SCOPE').length,
    },
    frMissingUc: frMissingUc.map((a) => ({
      id: String(a._id),
      externalKey: a.externalKey,
      title: a.title,
    })),
    brMissingBg: brMissingBg.map((a) => ({
      id: String(a._id),
      externalKey: a.externalKey,
      title: a.title,
    })),
    criticalGaps,
    criticalGapCount: criticalGaps.length,
    readyForPhase2: readiness.readyForPhase2,
    blockingReasons: readiness.blockingReasons,
    deliveryPhase: coerceDeliveryPhase(project?.deliveryPhase),
    raReadiness: {
      raApproved: ra.raApproved,
      blockingReasons: ra.blockingReasons,
      requiredKinds: ra.requiredKinds,
    },
    planningReadiness: {
      planningBaselineExists,
      byKind: planningSummary?.byKind || {},
    },
    srsBaselineExists,
    planningBaselineExists,
    constraints,
    assumptions,
  };
}

const CONSTRAINTS_ASSUMPTIONS_CAP = 100;

/** RULE-10 read-model: pack + NFR Constraint + structured fields (cap 100). */
async function collectConstraintsAssumptions({ projectId, artifacts }) {
  const constraints = [];
  const assumptions = [];
  try {
    const AnalysisImportSet = require('../models/AnalysisImportSet');
    const RequirementPack = require('../models/RequirementPack');
    const active = await AnalysisImportSet.findOne({ projectId, status: 'active' })
      .select('packId')
      .lean();
    if (active?.packId) {
      const pack = await RequirementPack.findById(active.packId)
        .select('constraints assumptions')
        .lean();
      for (const c of pack?.constraints || []) {
        if (constraints.length >= CONSTRAINTS_ASSUMPTIONS_CAP) break;
        const text = String(c?.description || '').trim();
        if (!text) continue;
        constraints.push({
          source: 'pack',
          text: text.slice(0, 500),
          externalKey: String(c?.type || '').trim().slice(0, 64),
        });
      }
      for (const a of pack?.assumptions || []) {
        if (assumptions.length >= CONSTRAINTS_ASSUMPTIONS_CAP) break;
        const text = String(a?.assumption || '').trim();
        if (!text) continue;
        assumptions.push({
          source: 'pack',
          text: text.slice(0, 500),
          impactIfInvalid: String(a?.impactIfInvalid || '').trim().slice(0, 300),
          externalKey: String(a?.externalId || '').trim().slice(0, 64),
        });
      }
    }
  } catch {
    /* pack optional */
  }

  for (const art of artifacts || []) {
    if (constraints.length < CONSTRAINTS_ASSUMPTIONS_CAP) {
      const cat = String(art.structured?.category || '').trim().toLowerCase();
      const constraintText = String(art.structured?.constraint || '').trim();
      if (art.kind === 'NFR' && (cat === 'constraint' || constraintText)) {
        constraints.push({
          source: 'nfr',
          text: (constraintText || String(art.title || '')).slice(0, 500),
          externalKey: String(art.externalKey || '').slice(0, 64),
        });
      } else if (constraintText) {
        constraints.push({
          source: 'artifact',
          text: constraintText.slice(0, 500),
          externalKey: String(art.externalKey || '').slice(0, 64),
        });
      }
    }
    if (assumptions.length < CONSTRAINTS_ASSUMPTIONS_CAP) {
      const assumptionText = String(art.structured?.assumption || '').trim();
      if (assumptionText) {
        assumptions.push({
          source: 'artifact',
          text: assumptionText.slice(0, 500),
          impactIfInvalid: String(art.structured?.impactIfInvalid || '').trim().slice(0, 300),
          externalKey: String(art.externalKey || '').slice(0, 64),
        });
      }
    }
  }

  return {
    constraints: constraints.slice(0, CONSTRAINTS_ASSUMPTIONS_CAP),
    assumptions: assumptions.slice(0, CONSTRAINTS_ASSUMPTIONS_CAP),
  };
}

/**
 * One lifecycle step for ≤500 active artifacts in fromStatus.
 * Permission checked once; updateMany (no N+1 save). Four-eyes skips self BA→Tech.
 */
async function bulkTransitionArtifacts({
  userId,
  projectId,
  fromStatus,
  toStatus,
  note = '',
}) {
  await assertProjectMemberAccess({ userId, projectId });
  const from = String(fromStatus || '')
    .trim()
    .toLowerCase();
  const to = String(toStatus || '')
    .trim()
    .toLowerCase();
  if (!canTransitionArtifactStatus(from, to)) {
    const err = new Error(`Không bulk chuyển được ${from} → ${to}`);
    err.statusCode = 400;
    err.errorCode = 'ARTIFACT_TRANSITION_DENIED';
    throw err;
  }

  const perm = permissionForArtifactTransition(from, to);
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  if (!bypass && perm) {
    await assertAnalysisPerm({ userId, projectId, permission: perm });
  }

  const gateNote = String(note || '').trim().slice(0, 1000);
  const stamp = { userId, at: new Date(), note: gateNote };
  const filter = { projectId, isActive: true, status: from };
  let skippedFourEyes = 0;

  // Four-eyes: BA cannot promote own artifact to tech_review
  if (from === 'ba_review' && to === 'tech_review' && !bypass) {
    const ownCount = await AnalysisArtifact.countDocuments({
      ...filter,
      createdBy: userId,
    });
    skippedFourEyes = ownCount;
    filter.createdBy = { $ne: userId };
  }

  const candidateCount = await AnalysisArtifact.countDocuments({
    projectId,
    isActive: true,
    status: from,
  });

  const $set = {
    status: to,
    updatedBy: userId,
    updatedAt: new Date(),
  };
  if (from === 'ba_review' && (to === 'tech_review' || to === 'rejected')) {
    $set['review.ba'] = stamp;
  }
  if (from === 'tech_review' && (to === 'po_review' || to === 'rejected')) {
    $set['review.tech'] = stamp;
  }
  if (from === 'po_review' && (to === 'approved' || to === 'rejected')) {
    $set['review.po'] = stamp;
  }
  if (to === 'rejected' && gateNote) {
    $set.rejectionReason = gateNote;
  }

  // Cap via ids to avoid unbounded write
  const ids = await AnalysisArtifact.find(filter).select('_id').limit(500).lean();
  const idList = ids.map((r) => r._id);
  let updated = 0;
  if (idList.length) {
    const res = await AnalysisArtifact.updateMany(
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
              errorCode: 'ARTIFACT_FOUR_EYES',
              message: `Bỏ qua ${skippedFourEyes} artifact do four-eyes (author = actor)`,
            },
          ]
        : [],
    truncated: idList.length >= 500,
  };
}

async function cutSrsBaseline({ userId, projectId, body = {} }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:cut_srs',
  });
  const gap = await computeGapReport({ userId, projectId });
  if (gap.criticalGapCount > 0) {
    const err = new Error('Không cắt SRS khi còn Critical gap');
    err.statusCode = 400;
    err.errorCode = 'SRS_CRITICAL_GAP';
    err.details = gap.criticalGaps;
    throw err;
  }
  const approved = await AnalysisArtifact.find({
    projectId,
    isActive: true,
    status: 'approved',
  }).lean();
  if (!approved.length) {
    const err = new Error('Chưa có artifact approved để cắt baseline');
    err.statusCode = 400;
    throw err;
  }
  const srsVersion = String(body.srsVersion || '').trim() || `SRS-${Date.now()}`;
  try {
    const baseline = await SrsBaseline.create({
      organizationId: project.organizationId,
      projectId,
      srsVersion,
      title: String(body.title || '').trim().slice(0, 240),
      artifactIds: approved.map((a) => a._id),
      artifactSnapshot: approved.map((a) => ({
        artifactId: a._id,
        kind: a.kind,
        externalKey: a.externalKey,
        title: a.title,
        version: a.version,
        contentHash: a.contentHash,
      })),
      approvedBy: userId,
      approvedAt: new Date(),
      notes: String(body.notes || '').trim().slice(0, 2000),
    });
    return serializeDoc(baseline);
  } catch (e) {
    if (e && e.code === 11000) {
      const err = new Error('srsVersion đã tồn tại');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
}

async function listSrsBaselines({ userId, projectId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({ userId, projectId, permission: 'analysis:view' });
  const rows = await SrsBaseline.find({ projectId, isActive: true }).sort({ createdAt: -1 }).lean();
  return rows.map(serializeDoc);
}

/**
 * Seed AnalysisArtifact rows from an approved/linked RequirementPack (best-effort).
 */
async function seedArtifactsFromRequirementPack({
  userId,
  projectId,
  pack,
  importSetId = null,
  sourceDocumentId = null,
}) {
  if (!pack || !projectId) return { seeded: 0 };
  const project = await Project.findById(projectId).lean();
  if (!project) return { seeded: 0 };

  const orgId = project.organizationId;
  const packId = pack._id;
  let seeded = 0;

  const existingRows = await AnalysisArtifact.find({
    projectId,
    isActive: true,
    version: 1,
  })
    .select('kind externalKey')
    .lean();
  const existingKeys = new Set(existingRows.map((a) => `${a.kind}::${a.externalKey}`));
  const pendingCreates = [];

  const upsert = async (payload) => {
    const key = `${payload.kind}::${payload.externalKey}`;
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    pendingCreates.push({
      organizationId: orgId,
      projectId,
      ...payload,
      source: 'seed_from_pack',
      sourcePackId: packId,
      importSetId: importSetId || null,
      sourceDocumentId: sourceDocumentId || null,
      status: 'draft',
      createdBy: userId,
      updatedBy: userId,
      contentHash: hashContent(payload),
      isActive: true,
      version: 1,
    });
    seeded += 1;
  };

  const overview = pack.overview || {};
  if (overview.projectObjective || overview.businessScope) {
    await upsert({
      kind: 'BG',
      externalKey: 'BG-001',
      title: String(overview.requirementName || overview.projectObjective || 'Business Goal').slice(
        0,
        240
      ),
      summary: String(overview.businessScope || '').slice(0, 2000),
      structured: {
        statement: String(overview.projectObjective || ''),
        successMetric: String(overview.expectedUsers || overview.expectedScale || ''),
        priority: String(overview.priority || 'Medium'),
      },
    });
  }

  const businessGoals = Array.isArray(pack.businessGoals) ? pack.businessGoals : [];
  for (const bg of businessGoals) {
    const externalKey = String(bg.externalId || bg.externalKey || '').trim();
    if (!externalKey) continue;
    await upsert({
      kind: 'BG',
      externalKey,
      title: String(bg.title || externalKey).slice(0, 240),
      summary: String(bg.statement || bg.businessProblem || '').slice(0, 2000),
      structured: {
        statement: String(bg.statement || ''),
        businessProblem: String(bg.businessProblem || ''),
        expectedBusinessOutcome: String(bg.expectedBusinessOutcome || ''),
        successMetric: String(bg.successMetric || ''),
        priority: String(bg.priority || 'Medium'),
        stakeholder: String(bg.stakeholder || ''),
        assumption: String(bg.assumption || ''),
        constraint: String(bg.constraint || ''),
        status: String(bg.status || ''),
        baNote: String(bg.baNote || ''),
        customerRequirementIds: Array.isArray(bg.customerRequirementIds)
          ? bg.customerRequirementIds
          : [],
      },
    });
  }

  const scopes = Array.isArray(pack.scope) ? pack.scope : [];
  let sc = 1;
  for (const row of scopes) {
    const desc = String(row.description || '').trim();
    if (!desc) continue;
    const type = String(row.type || row.scopeType || 'in').toLowerCase().includes('out')
      ? 'out'
      : 'in';
    await upsert({
      kind: 'SCOPE',
      externalKey: `SC-${String(sc).padStart(3, '0')}`,
      title: desc.slice(0, 240),
      structured: { scopeType: type, description: desc },
    });
    sc += 1;
  }

  const frs = Array.isArray(pack.functionalRequirements) ? pack.functionalRequirements : [];
  for (const fr of frs) {
    const externalKey = String(fr.externalId || fr.externalKey || '').trim();
    if (!externalKey) continue;
    await upsert({
      kind: 'FR',
      externalKey,
      title: String(fr.name || externalKey).slice(0, 240),
      summary: String(fr.description || '').slice(0, 2000),
      structured: {
        level: fr.level || 'Requirement',
        parentExternalKey: fr.parentExternalId || '',
        description: fr.description || '',
        priority: fr.priority || 'Medium',
        acceptanceCriteria: fr.acceptanceCriteria || '',
        actor: fr.actor || '',
        moduleLabel: fr.moduleLabel || '',
        capabilityLabel: fr.capabilityLabel || '',
        featureLabel: fr.featureLabel || '',
        trigger: fr.trigger || '',
        preconditions: fr.preconditions || '',
        mainBehavior: fr.mainFlow || '',
        businessRule: fr.businessRules || '',
        input: fr.input || '',
        output: fr.output || '',
        exception: fr.exceptionFlow || '',
        dependency: fr.frDependencies || '',
        assumption: fr.assumption || '',
        constraint: fr.constraintsNotes || '',
        status: fr.status || '',
        baNote: fr.baNote || '',
        customerRequirementIds: Array.isArray(fr.customerRequirementIds)
          ? fr.customerRequirementIds
          : [],
        brIds: Array.isArray(fr.brIds) ? fr.brIds : [],
        bpmIds: Array.isArray(fr.bpmIds) ? fr.bpmIds : [],
      },
    });
  }

  const nfrs = Array.isArray(pack.nonFunctionalRequirements)
    ? pack.nonFunctionalRequirements
    : [];
  for (const nfr of nfrs) {
    const externalKey = String(nfr.externalId || nfr.id || '').trim();
    if (!externalKey) continue;
    await upsert({
      kind: 'NFR',
      externalKey,
      title: String(nfr.requirement || nfr.name || externalKey).slice(0, 240),
      structured: {
        category: nfr.category || '',
        target: nfr.target || '',
        measurement: nfr.measurement || '',
        priority: nfr.priority || 'Medium',
        scope: nfr.scope || '',
        constraint: nfr.constraint || '',
        verification: nfr.verification || nfr.acceptanceCriteria || '',
        acceptanceCriteria: nfr.acceptanceCriteria || '',
        source: nfr.source || '',
        status: nfr.status || '',
        baNote: nfr.baNote || '',
        customerRequirementIds: Array.isArray(nfr.customerRequirementIds)
          ? nfr.customerRequirementIds
          : [],
      },
    });
  }

  const businessRules = Array.isArray(pack.businessRules) ? pack.businessRules : [];
  for (const br of businessRules) {
    const externalKey = String(br.externalId || br.externalKey || '').trim();
    if (!externalKey) continue;
    await upsert({
      kind: 'BR',
      externalKey,
      title: String(br.title || externalKey).slice(0, 240),
      summary: String(br.description || '').slice(0, 2000),
      structured: {
        description: String(br.description || ''),
        businessRule: String(br.businessRule || ''),
        whenApplies: String(br.whenApplies || ''),
        exception: String(br.exception || ''),
        relatedBgKey: String(br.relatedBg || ''),
        stakeholder: String(br.stakeholder || ''),
        priority: String(br.priority || 'Medium'),
        successCriteria: String(br.successCriteria || ''),
        dependency: String(br.dependency || ''),
        assumption: String(br.assumption || ''),
        constraint: String(br.constraint || ''),
        status: String(br.status || ''),
        baNote: String(br.baNote || ''),
        customerRequirementIds: Array.isArray(br.customerRequirementIds)
          ? br.customerRequirementIds
          : [],
      },
    });
  }

  const businessProcesses = Array.isArray(pack.businessProcesses) ? pack.businessProcesses : [];
  for (const bpm of businessProcesses) {
    const externalKey = String(bpm.externalId || bpm.externalKey || '').trim();
    if (!externalKey) continue;
    const step = String(bpm.step || '').trim();
    const key = step ? `${externalKey}-S${step}` : externalKey;
    await upsert({
      kind: 'BPM',
      externalKey: key.slice(0, 64),
      title: String(bpm.processName || bpm.action || key).slice(0, 240),
      summary: String(bpm.action || bpm.processDescription || '').slice(0, 2000),
      structured: {
        processName: String(bpm.processName || ''),
        processDescription: String(bpm.processDescription || ''),
        step: step,
        actor: String(bpm.actor || ''),
        action: String(bpm.action || ''),
        input: String(bpm.input || ''),
        output: String(bpm.output || ''),
        relatedSystems: String(bpm.relatedSystems || ''),
        relatedBrKey: String(bpm.relatedBr || ''),
        trigger: String(bpm.trigger || ''),
        precondition: String(bpm.precondition || ''),
        businessRule: String(bpm.businessRule || ''),
        exception: String(bpm.exception || ''),
        relatedCr: String(bpm.relatedCr || ''),
        status: String(bpm.status || ''),
        baNote: String(bpm.baNote || ''),
      },
    });
  }

  const useCases = Array.isArray(pack.useCases) ? pack.useCases : [];
  for (const uc of useCases) {
    const externalKey = String(uc.externalId || uc.externalKey || '').trim();
    if (!externalKey) continue;
    const relatedFr = Array.isArray(uc.relatedFrIds)
      ? uc.relatedFrIds
      : String(uc.relatedFr || '')
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
    await upsert({
      kind: 'UC',
      externalKey,
      title: String(uc.title || externalKey).slice(0, 240),
      summary: String(uc.mainFlow || uc.goal || '').slice(0, 2000),
      structured: {
        actor: String(uc.actor || ''),
        secondaryActor: String(uc.secondaryActor || ''),
        goal: String(uc.goal || ''),
        trigger: String(uc.trigger || ''),
        precondition: String(uc.precondition || ''),
        postconditions: String(uc.postconditions || ''),
        mainFlow: String(uc.mainFlow || ''),
        alternativeFlow: String(uc.alternativeFlow || ''),
        exceptionFlow: String(uc.exceptionFlow || ''),
        businessRules: String(uc.businessRules || ''),
        input: String(uc.input || ''),
        output: String(uc.output || ''),
        relatedFrKeys: relatedFr,
        brIds: Array.isArray(uc.brIds) ? uc.brIds : [],
        customerRequirementIds: Array.isArray(uc.customerRequirementIds)
          ? uc.customerRequirementIds
          : [],
        priority: String(uc.priority || 'Medium'),
        status: String(uc.status || ''),
        baNote: String(uc.baNote || ''),
      },
    });
  }

  // Merge Traceability sheet CR refs onto matching artifacts (structured)
  const traceRows = Array.isArray(pack.traceabilityLinks) ? pack.traceabilityLinks : [];
  if (traceRows.length) {
    const artifacts = await AnalysisArtifact.find({ projectId, isActive: true }).lean();
    const byKey = new Map(artifacts.map((a) => [String(a.externalKey), a]));
    for (const row of traceRows) {
      const analysisId = String(row.analysisId || '').trim();
      const crId = String(row.customerRequirementId || '').trim();
      if (!analysisId || !crId) continue;
      let art = byKey.get(analysisId);
      if (!art) {
        // BPM steps use BPM-001-S1 keys
        art = artifacts.find(
          (a) =>
            String(a.externalKey) === analysisId ||
            String(a.externalKey).startsWith(`${analysisId}-S`)
        );
      }
      if (!art) continue;
      const structured = { ...(art.structured || {}) };
      const crs = new Set(
        Array.isArray(structured.customerRequirementIds) ? structured.customerRequirementIds : []
      );
      crs.add(crId);
      structured.customerRequirementIds = [...crs];
      structured.traceRelationship = String(row.relationship || structured.traceRelationship || '');
      structured.traceAnalysisStatus = String(
        row.analysisStatus || structured.traceAnalysisStatus || ''
      );
      structured.sourceReference = String(row.sourceReference || structured.sourceReference || '');
      await AnalysisArtifact.updateOne({ _id: art._id }, { $set: { structured } });
    }
  }

  // Seed UC→FR implements and BR→BG derives when keys exist
  if (pendingCreates.length) {
    const BATCH = 150;
    for (let i = 0; i < pendingCreates.length; i += BATCH) {
      const chunk = pendingCreates.slice(i, i + BATCH);
      try {
        await AnalysisArtifact.insertMany(chunk, { ordered: false });
      } catch (e) {
        // Duplicate key from concurrent seed — ignore; other errors rethrow.
        if (!(e && (e.code === 11000 || e.writeErrors || e.name === 'MongoBulkWriteError'))) {
          throw e;
        }
      }
    }
  }

  const allArts = await AnalysisArtifact.find({ projectId, isActive: true }).lean();
  const artByKey = new Map(allArts.map((a) => [String(a.externalKey), a]));
  let linksSeeded = 0;
  const existingLinks = await ArtifactTraceLink.find({ projectId, isActive: true })
    .select('fromArtifactId toArtifactId linkType')
    .lean();
  const existingLinkKeys = new Set(
    existingLinks.map(
      (l) => `${String(l.fromArtifactId)}::${String(l.toArtifactId)}::${l.linkType}`
    )
  );
  const pendingLinks = [];
  const queueLink = (fromKey, toKey, linkType) => {
    const from = artByKey.get(String(fromKey));
    const to = artByKey.get(String(toKey));
    if (!from || !to) return;
    const key = `${String(from._id)}::${String(to._id)}::${linkType}`;
    if (existingLinkKeys.has(key)) return;
    existingLinkKeys.add(key);
    pendingLinks.push({
      organizationId: orgId,
      projectId,
      fromArtifactId: from._id,
      toArtifactId: to._id,
      linkType,
      createdBy: userId,
      isActive: true,
    });
  };
  for (const uc of useCases) {
    const ucKey = String(uc.externalId || '').trim();
    const frKeys = Array.isArray(uc.relatedFrIds)
      ? uc.relatedFrIds
      : String(uc.relatedFr || '')
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
    for (const frKey of frKeys) {
      queueLink(ucKey, frKey, 'implements');
    }
  }
  for (const br of businessRules) {
    const brKey = String(br.externalId || '').trim();
    const bgKey = String(br.relatedBg || '').trim();
    if (brKey && bgKey) queueLink(brKey, bgKey, 'derives');
  }
  if (pendingLinks.length) {
    try {
      const inserted = await ArtifactTraceLink.insertMany(pendingLinks, { ordered: false });
      linksSeeded = inserted.length;
    } catch (e) {
      if (!(e && (e.code === 11000 || e.writeErrors || e.name === 'MongoBulkWriteError'))) {
        throw e;
      }
      linksSeeded = pendingLinks.length;
    }
  }

  return { seeded, linksSeeded };
}

/**
 * Confirm Phase 1 → Phase 2 (development).
 * mode=manual: patch deliveryPhase (+ optional methodology).
 * mode=ai: import work from SRS pack then patch deliveryPhase.
 */
async function advanceToPhase2({
  userId,
  projectId,
  mode = 'manual',
  packId = null,
  methodology = null,
  /** RULE-21 — default off; seed chính từ PlanningBaseline + publish-wbs */
  importWorkItems = false,
  applyAssignees = false,
  skipReadyGate = false,
  publishWbs = true,
  /** Explicit override khi wizard create-project mới (không có Phase1 plan path) */
  forcePackImport = false,
}) {
  const projectDoc = await Project.findById(projectId);
  if (!projectDoc || projectDoc.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const { hasPermission } = require('../utils/project/projectPermissionMatrix');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  if (!bypass && !hasPermission(resolved.permissions, 'delivery_phase:change')) {
    const err = new Error('Không có quyền chuyển deliveryPhase');
    err.statusCode = 403;
    throw err;
  }

  const gaps = await computeGapReport({ userId, projectId });
  if (!skipReadyGate && !gaps.readyForPhase2) {
    const err = new Error('Phase 1 chưa sẵn sàng chuyển Phase 2');
    err.statusCode = 400;
    err.errorCode = 'PHASE1_NOT_READY';
    err.details = gaps.blockingReasons;
    throw err;
  }

  const chosen = String(mode || 'manual').trim().toLowerCase() === 'ai' ? 'ai' : 'manual';
  let importStats = null;
  let wbsPublish = null;

  if (chosen === 'ai') {
    const pid = String(packId || '').trim();
    if (!pid) {
      const err = new Error('packId (SRS) là bắt buộc cho chế độ AI');
      err.statusCode = 400;
      throw err;
    }
    const RequirementPack = require('../models/RequirementPack');
    const pack = await RequirementPack.findOne({
      _id: pid,
      organizationId: projectDoc.organizationId,
      isActive: true,
    });
    if (!pack) {
      const err = new Error('SRS / Requirement pack không tồn tại');
      err.statusCode = 404;
      throw err;
    }
    if (!pack.projectId || String(pack.projectId) !== String(projectId)) {
      pack.projectId = projectId;
      if (pack.status === 'approved') {
        pack.status = 'project_linked';
      }
      await pack.save();
    }
    await seedArtifactsFromRequirementPack({
      userId,
      projectId,
      pack: pack.toObject(),
    });
    // RULE-21: nếu đã có Planning Baseline thì không seed work từ pack trừ forcePackImport
    const hasPlanBaseline = Boolean(gaps.planningBaselineExists);
    const allowPackImport =
      Boolean(forcePackImport) || (Boolean(importWorkItems) && !hasPlanBaseline);
    if (allowPackImport) {
      const TaskBoard = require('../models/TaskBoard');
      const board = await TaskBoard.findOne({ projectId, isActive: true }).lean();
      const { importRequirementPackWorkItems } = require('./requirementPackWorkImport.service');
      importStats = await importRequirementPackWorkItems({
        userId,
        organizationId: projectDoc.organizationId,
        pack: pack.toObject(),
        project: projectDoc.toObject(),
        boardId: board?._id,
        leafAssignments: [],
        applyAssignees: Boolean(applyAssignees),
      });
    } else if (importWorkItems && hasPlanBaseline) {
      importStats = {
        skipped: true,
        reason: 'PLANNING_BASELINE_SEED_PATH',
        message: 'Đã có Planning Baseline — seed Board qua publish-wbs, không import từ pack',
      };
    }
  }

  if (publishWbs) {
    try {
      const deliveryPlanningService = require('./deliveryPlanning.service');
      wbsPublish = await deliveryPlanningService.publishWbsToDevelopment({ userId, projectId });
    } catch (e) {
      wbsPublish = { published: 0, error: e.message };
    }
  }

  const {
    canTransitionDeliveryPhase,
    coerceDeliveryPhase,
  } = require('../constants/projectDeliveryPhase');
  const from = coerceDeliveryPhase(projectDoc.deliveryPhase);
  if (!canTransitionDeliveryPhase(from, 'development') && from !== 'development') {
    const allowed =
      from === 'requirement_analysis' ||
      from === 'delivery_planning' ||
      from === 'development';
    if (!allowed) {
      const err = new Error(`Không chuyển được ${from} → development`);
      err.statusCode = 400;
      throw err;
    }
  }

  projectDoc.deliveryPhase = 'development';
  // Lifecycle status is orthogonal to deliveryPhase but must stay in Project enum.
  // Legacy/bad rows (e.g. status "draft") fail validation on save — coerce into Phase 2.
  const PROJECT_STATUS = new Set([
    'planning',
    'ready_for_planning',
    'in_development',
    'on_hold',
    'closed',
  ]);
  if (!PROJECT_STATUS.has(String(projectDoc.status || ''))) {
    projectDoc.status = 'in_development';
  } else if (
    projectDoc.status === 'planning' ||
    projectDoc.status === 'ready_for_planning'
  ) {
    projectDoc.status = 'in_development';
  }
  if (methodology) {
    const m = String(methodology).trim().toLowerCase();
    if (['scrum', 'kanban', 'waterfall'].includes(m)) {
      projectDoc.methodology = m;
    }
  }
  await projectDoc.save();

  return {
    projectId: String(projectDoc._id),
    deliveryPhase: projectDoc.deliveryPhase,
    mode: chosen,
    importStats,
    wbsPublish,
    methodology: projectDoc.methodology,
  };
}

/**
 * Read-only SRS draft composed from approved analysis artifacts.
 */
async function getSrsDraft({ userId, projectId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({ userId, projectId, permission: 'analysis:view' });
  const artifacts = await AnalysisArtifact.find({
    projectId,
    isActive: true,
    status: 'approved',
  })
    .sort({ kind: 1, externalKey: 1 })
    .lean();
  const group = (k) =>
    artifacts
      .filter((a) => a.kind === k)
      .map((a) => ({
        id: String(a._id),
        externalKey: a.externalKey,
        title: a.title,
        summary: a.summary,
        version: a.version,
        structured: a.structured || {},
      }));
  return {
    generatedAt: new Date().toISOString(),
    sections: {
      SCOPE: group('SCOPE'),
      BG: group('BG'),
      BR: group('BR'),
      BPM: group('BPM'),
      FR: group('FR'),
      UC: group('UC'),
      NFR: group('NFR'),
    },
    artifactCount: artifacts.length,
  };
}

/**
 * PM/PO: Start Delivery Planning after RA approved (manual phase change).
 */
async function startDeliveryPlanning({ userId, projectId }) {
  const projectDoc = await Project.findById(projectId);
  if (!projectDoc || projectDoc.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const { hasPermission } = require('../utils/project/projectPermissionMatrix');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  if (!bypass && !hasPermission(resolved.permissions, 'delivery_phase:change')) {
    const err = new Error('Không có quyền Start Planning (delivery_phase:change)');
    err.statusCode = 403;
    throw err;
  }
  const gaps = await computeGapReport({ userId, projectId });
  if (!gaps.raReadiness?.raApproved) {
    const err = new Error('Requirement Analysis chưa sẵn sàng để Start Planning');
    err.statusCode = 400;
    err.errorCode = 'RA_NOT_READY';
    err.details = gaps.raReadiness?.blockingReasons || gaps.blockingReasons;
    throw err;
  }
  /** RULE-19 — SRS Baseline bắt buộc trước khi vào Planning */
  if (!gaps.srsBaselineExists) {
    const err = new Error('Cần cắt SRS Baseline trước khi Start Planning');
    err.statusCode = 409;
    err.errorCode = 'SRS_BASELINE_REQUIRED';
    err.details = [{ code: 'NO_SRS_BASELINE', message: 'Chưa có SRS Baseline active' }];
    throw err;
  }
  const from = String(projectDoc.deliveryPhase || '');
  if (from === 'delivery_planning') {
    return {
      projectId: String(projectDoc._id),
      deliveryPhase: 'delivery_planning',
      alreadyStarted: true,
    };
  }
  if (from !== 'requirement_analysis') {
    const err = new Error('Chỉ Start Planning từ requirement_analysis');
    err.statusCode = 400;
    throw err;
  }
  projectDoc.deliveryPhase = 'delivery_planning';
  projectDoc.phase1RaApprovedAt = new Date();
  await projectDoc.save();
  return {
    projectId: String(projectDoc._id),
    deliveryPhase: projectDoc.deliveryPhase,
    phase1RaApprovedAt: projectDoc.phase1RaApprovedAt,
    alreadyStarted: false,
  };
}

/**
 * Project-scoped Analysis workbook preview — auth via analysis:* (not org requirement:import).
 * Creates RequirementImportSession for later confirmAnalysisImport.
 */
async function previewAnalysisImport({ userId, projectId, fileBuffer, fileName }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:artifact_import',
  });

  const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer || []);
  if (!buffer.length) {
    const err = new Error('file (.xlsx) bắt buộc');
    err.statusCode = 400;
    err.errorCode = 'REQ_IMPORT_FILE_REQUIRED';
    throw err;
  }

  const RequirementImportSession = require('../models/RequirementImportSession');
  const {
    IMPORT_SESSION_TTL_HOURS,
    TEMPLATE_VERSION,
  } = require('../constants/requirementTemplate.constants');
  const {
    peekWorkbookTemplateType,
    isAnalysisTemplateType,
    parseAnalysisWorkbook,
  } = require('../utils/requirement/requirementAnalysisTemplateParse');
  const {
    validateAnalysisWorkbook,
  } = require('../utils/requirement/requirementAnalysisTemplateValidate');
  const {
    buildExcelPreviewFromBuffer,
    XLSX_MIME,
  } = require('../utils/requirement/requirementExcelPreview');
  const { pickPlanningReadinessSummary } = require('../utils/requirement/requirementPlanningReadiness');
  const { mapParsedToPackPayload } = require('./requirementImport.service');

  const peekedType = peekWorkbookTemplateType(buffer);
  if (!isAnalysisTemplateType(peekedType)) {
    const err = new Error(
      'Chỉ chấp nhận workbook Requirement Analysis (TemplateType=RequirementAnalysis)'
    );
    err.statusCode = 400;
    err.errorCode = 'IMPORT_SET_EXPECT_ANALYSIS';
    throw err;
  }

  const parsed = parseAnalysisWorkbook(buffer);
  const validation = validateAnalysisWorkbook({
    fileName,
    fileSize: buffer.length || 0,
    parsed,
  });

  let previewPayload = null;
  if (validation.valid) {
    previewPayload = mapParsedToPackPayload(parsed);
  }

  const excelPreview = buildExcelPreviewFromBuffer(buffer, {
    fileName: String(fileName || '').slice(0, 255),
    functionalRequirements: parsed.functionalRequirements || [],
  });

  const expiresAt = new Date(Date.now() + IMPORT_SESSION_TTL_HOURS * 60 * 60 * 1000);
  const session = await RequirementImportSession.create({
    organizationId: project.organizationId,
    projectId,
    uploadedBy: userId,
    fileName: String(fileName || '').slice(0, 255),
    templateVersion: parsed.templateVersion || TEMPLATE_VERSION,
    status: 'preview',
    expiresAt,
    errorCount: validation.errorCount,
    warningCount: validation.warningCount,
    issues: validation.issues,
    summary: validation.summary,
    previewPayload,
    previewTree: validation.previewTree,
    excelPreview,
    fileBuffer: buffer.length <= 5 * 1024 * 1024 ? buffer : undefined,
    fileContentType: XLSX_MIME,
    newSkillsDetected: [],
    skillResolveEnabled: false,
  });

  return {
    sessionId: String(session._id),
    fileName: session.fileName,
    templateVersion: session.templateVersion,
    templateType: 'RequirementAnalysis',
    valid: validation.valid,
    canRunAiAnalysis: false,
    errorCount: validation.errorCount,
    warningCount: validation.warningCount,
    infoCount: validation.infoCount || 0,
    issues: validation.issues,
    summary: validation.summary,
    previewTree: validation.previewTree,
    excelPreview,
    expiresAt: session.expiresAt,
    planningReadiness: previewPayload ? pickPlanningReadinessSummary(previewPayload) : null,
  };
}

/**
 * Project-scoped import confirm: Import Set + RequirementPack + seed AnalysisArtifacts.
 * Reuses org-level RequirementImportSession preview payload.
 * RULE-06: draft must already have Raw; activates set and trashes previous ACTIVE.
 */
async function confirmAnalysisImport({ userId, projectId, sessionId, importSetId = null }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:artifact_import',
  });
  const RequirementImportSession = require('../models/RequirementImportSession');
  const RequirementPack = require('../models/RequirementPack');
  const importSetService = require('./analysisImportSet.service');
  const session = await RequirementImportSession.findOne({
    _id: sessionId,
    organizationId: project.organizationId,
    status: 'preview',
  });
  if (!session) {
    const err = new Error('Import session không tồn tại hoặc đã hết hạn');
    err.statusCode = 404;
    throw err;
  }
  if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
    session.status = 'expired';
    await session.save();
    const err = new Error('Import session đã hết hạn');
    err.statusCode = 410;
    throw err;
  }
  if (session.errorCount > 0 || !session.previewPayload) {
    const err = new Error('Không thể import — file còn lỗi validation');
    err.statusCode = 400;
    throw err;
  }

  const payload = session.previewPayload;
  if (!payload?.isRequirementAnalysis) {
    const err = new Error(
      'Confirm Import Set chỉ chấp nhận workbook Requirement Analysis (không phải Raw/SRS)'
    );
    err.statusCode = 400;
    err.errorCode = 'IMPORT_SET_EXPECT_ANALYSIS';
    throw err;
  }
  // Clamp overview for schema limits (in-flight preview sessions may predate clamp on map).
  if (payload?.overview && typeof payload.overview === 'object') {
    payload.overview = clampOverviewForPack(payload.overview);
  }

  let draftSet;
  if (importSetId) {
    draftSet = await require('../models/AnalysisImportSet').findOne({
      _id: importSetId,
      projectId,
      status: 'draft',
    });
    if (!draftSet) {
      const err = new Error('Draft Import Set không tồn tại');
      err.statusCode = 404;
      throw err;
    }
  } else {
    draftSet = await importSetService.ensureDraftImportSet({
      userId,
      projectId,
      organizationId: project.organizationId,
    });
  }
  if (!draftSet.rawDocumentId) {
    const err = new Error(
      'Thiếu file Raw — gắn Customer Requirement Raw trước khi confirm Analysis'
    );
    err.statusCode = 400;
    err.errorCode = 'IMPORT_SET_MISSING_RAW';
    throw err;
  }

  const analysisMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const analysisBuffer =
    session.fileBuffer && Buffer.isBuffer(session.fileBuffer) ? session.fileBuffer : null;
  let analysisStorageKey = `pending/${projectId}/${Date.now()}-analysis`.slice(0, 512);
  let analysisContentHash = '';
  let analysisSize = analysisBuffer ? analysisBuffer.length : null;
  if (analysisBuffer && analysisBuffer.length > 0) {
    const stored = await importSetService.persistImportSetFileBuffer({
      projectId,
      setId: draftSet._id,
      slot: 'analysis',
      fileName: session.fileName || 'Requirement_Analysis.xlsx',
      mimeType: analysisMime,
      buffer: analysisBuffer,
    });
    if (stored.storageKey) analysisStorageKey = stored.storageKey;
    analysisContentHash = stored.contentHash;
    analysisSize = stored.sizeBytes;
  }

  const analysisDoc = await CustomerDocument.create({
    organizationId: project.organizationId,
    projectId,
    filename: String(session.fileName || 'Requirement_Analysis.xlsx').slice(0, 260),
    mimeType: analysisMime,
    storageKey: analysisStorageKey,
    sizeBytes: analysisSize,
    contentHash: analysisContentHash,
    docClass: 'requirement_analysis',
    notes: `import:${sessionId}`,
    importSetId: draftSet._id,
    uploadedBy: userId,
    isActive: true,
  });

  let pack = null;
  if (session.requirementPackId) {
    pack = await RequirementPack.findById(session.requirementPackId);
  }
  if (!pack) {
    pack = await RequirementPack.findOne({ importSessionId: session._id, projectId });
  }
  if (!pack) {
    const packSeed = {
      organizationId: project.organizationId,
      projectId,
      importSetId: draftSet._id,
      createdBy: userId,
      status: 'draft',
      importSessionId: session._id,
      sourceFileName: session.fileName,
      previewTree: session.previewTree || null,
      importIssues: session.issues || [],
      ...payload,
      templateVersion: session.templateVersion || payload.templateVersion || '1.0',
    };
    pack = await RequirementPack.create(packSeed);
  } else {
    pack.projectId = projectId;
    pack.importSetId = draftSet._id;
    pack.overview = payload.overview || pack.overview;
    pack.scope = payload.scope || pack.scope;
    pack.functionalRequirements = payload.functionalRequirements || pack.functionalRequirements;
    pack.nonFunctionalRequirements =
      payload.nonFunctionalRequirements || pack.nonFunctionalRequirements;
    if (payload.businessGoals) pack.businessGoals = payload.businessGoals;
    if (payload.businessRules) pack.businessRules = payload.businessRules;
    if (payload.businessProcesses) pack.businessProcesses = payload.businessProcesses;
    if (payload.useCases) pack.useCases = payload.useCases;
    if (payload.traceabilityLinks) pack.traceabilityLinks = payload.traceabilityLinks;
    pack.updatedBy = userId;
    await pack.save();
  }

  session.status = 'imported';
  session.requirementPackId = pack._id;
  session.customerDocumentId = analysisDoc._id;
  session.projectId = projectId;
  session.fileBuffer = undefined;
  await session.save();

  const gateEnabled = isPhase1SetGateEnabled();
  let seededCount = 0;
  let resultSet;

  if (gateEnabled) {
    resultSet = await importSetService.stageImportSetOnConfirm({
      userId,
      projectId,
      importSetId: draftSet._id,
      analysisDocumentId: analysisDoc._id,
      packId: pack._id,
    });
  } else {
    const seeded = await seedArtifactsFromRequirementPack({
      userId,
      projectId,
      pack: pack.toObject ? pack.toObject() : pack,
      importSetId: draftSet._id,
      sourceDocumentId: analysisDoc._id,
    });
    seededCount = seeded.seeded || 0;
    resultSet = await importSetService.activateImportSetOnConfirm({
      userId,
      projectId,
      importSetId: draftSet._id,
      analysisDocumentId: analysisDoc._id,
      packId: pack._id,
    });
  }

  return {
    sessionId: String(session._id),
    packId: String(pack._id),
    seeded: seededCount,
    projectId: String(projectId),
    importSetId: String(resultSet._id),
    importSetStatus: resultSet.status,
    gateEnabled,
  };
}

module.exports = {
  listCustomerDocuments,
  createCustomerDocument,
  listArtifacts,
  getArtifact,
  createArtifact,
  updateArtifactDraft,
  transitionArtifactStatus,
  bulkTransitionArtifacts,
  createTraceLink,
  listTraceLinks,
  computeGapReport,
  cutSrsBaseline,
  listSrsBaselines,
  seedArtifactsFromRequirementPack,
  advanceToPhase2,
  getSrsDraft,
  startDeliveryPlanning,
  previewAnalysisImport,
  confirmAnalysisImport,
};
