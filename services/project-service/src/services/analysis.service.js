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
    throw err;
  }
  assertCanAuthorKind({
    permissions: resolved.permissions,
    kind: doc.kind,
    isBypass: bypass,
  });
  if (body.title !== undefined) doc.title = String(body.title || '').trim().slice(0, 240);
  if (body.summary !== undefined) doc.summary = String(body.summary || '').trim().slice(0, 2000);
  if (body.body !== undefined) doc.body = String(body.body || '').trim().slice(0, 20000);
  if (body.structured !== undefined && typeof body.structured === 'object') {
    doc.structured = body.structured;
  }
  if (doc.status === 'rejected' && body.reopen === true) {
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

  const project = await Project.findById(projectId).select('deliveryPhase').lean();
  const { evaluateReadyForPhase2 } = require('../constants/phase2Gate');
  const { coerceDeliveryPhase } = require('../constants/projectDeliveryPhase');
  const readiness = evaluateReadyForPhase2({
    deliveryPhase: coerceDeliveryPhase(project?.deliveryPhase),
    artifacts,
    criticalGapCount: criticalGaps.length,
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
}) {
  if (!pack || !projectId) return { seeded: 0 };
  const project = await Project.findById(projectId).lean();
  if (!project) return { seeded: 0 };

  const orgId = project.organizationId;
  const packId = pack._id;
  let seeded = 0;

  const upsert = async (payload) => {
    const existing = await AnalysisArtifact.findOne({
      projectId,
      kind: payload.kind,
      externalKey: payload.externalKey,
      version: 1,
    }).lean();
    if (existing) return;
    await AnalysisArtifact.create({
      organizationId: orgId,
      projectId,
      ...payload,
      source: 'seed_from_pack',
      sourcePackId: packId,
      status: 'draft',
      createdBy: userId,
      updatedBy: userId,
      contentHash: hashContent(payload),
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
        featureLabel: fr.featureLabel || '',
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
        priority: nfr.priority || 'Medium',
        verification: nfr.verification || nfr.acceptance || '',
      },
    });
  }

  return { seeded };
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
  importWorkItems = true,
  applyAssignees = true,
  skipReadyGate = false,
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
    // Link pack to project if needed
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
    if (importWorkItems) {
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
    }
  }

  const {
    canTransitionDeliveryPhase,
    coerceDeliveryPhase,
  } = require('../constants/projectDeliveryPhase');
  const from = coerceDeliveryPhase(projectDoc.deliveryPhase);
  if (!canTransitionDeliveryPhase(from, 'development') && from !== 'development') {
    // Allow direct jump from requirement_analysis — extend if matrix blocks
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
    methodology: projectDoc.methodology,
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
  createTraceLink,
  listTraceLinks,
  computeGapReport,
  cutSrsBaseline,
  listSrsBaselines,
  seedArtifactsFromRequirementPack,
  advanceToPhase2,
};
