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
  canResubmitFromChangesRequested,
  permissionForArtifactTransition,
  isArtifactContentEditableStatus,
  isReviewNoteRequired,
} = require('../constants/analysisArtifact');
const {
  isProjectRbacV2Enabled,
  hasPermission,
} = require('../utils/project/projectPermissionMatrix');
const { assertUserProjectPermission, assertUserAnyProjectPermission } =
  require('./projectAccess.service');
const { clampOverviewForPack } = require('../utils/requirement/requirementOverviewClamp');
const objectStorage = require('../utils/common/objectStorage');
const {
  buildCustomerDocumentStoragePath,
} = require('../utils/analysis/customerDocumentStorage');
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
  const key = String(permission || '').trim().toLowerCase();
  if (key === 'analysis:document_upload' || key === 'analysis:artifact_import') {
    const { assertUserProjectRoleMatrixPermission } = require('./projectAccess.service');
    await assertUserProjectRoleMatrixPermission({
      userId,
      projectId,
      permission: key,
      message: message || `Thiếu quyền ${key} — chỉ BA được tải Raw/Analysis`,
    });
    return;
  }
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

/**
 * Download Import Set / customer doc bytes from MinIO (extend GET customer-documents).
 */
async function downloadCustomerDocument({ userId, projectId, documentId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:view',
  });
  const id = String(documentId || '').trim();
  if (!id) {
    const err = new Error('documentId là bắt buộc');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_INVALID_ID';
    throw err;
  }
  const doc = await CustomerDocument.findOne({
    _id: id,
    projectId,
    isActive: true,
  }).lean();
  if (!doc) {
    const err = new Error('Tài liệu không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const storageKey = String(doc.storageKey || '').trim();
  if (!storageKey) {
    const err = new Error('Tài liệu chưa có file trên storage');
    err.statusCode = 404;
    err.errorCode = 'DOCUMENT_NO_STORAGE';
    throw err;
  }
  const objectStorage = require('../utils/common/objectStorage');
  if (!objectStorage.isEnabled()) {
    const err = new Error('Object storage chưa bật — không tải được file');
    err.statusCode = 503;
    err.errorCode = 'OBJECT_STORAGE_DISABLED';
    throw err;
  }
  const stream = await objectStorage.getObjectStream(storageKey);
  return {
    stream,
    fileName: String(doc.filename || 'document.xlsx').slice(0, 260),
    mimeType: String(doc.mimeType || 'application/octet-stream').slice(0, 120),
    sizeBytes: doc.sizeBytes ?? null,
  };
}

/**
 * Download Import Set / customer doc bytes from MinIO (extend GET customer-documents).
 */
async function downloadCustomerDocument({ userId, projectId, documentId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:view',
  });
  const id = String(documentId || '').trim();
  if (!id) {
    const err = new Error('documentId là bắt buộc');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_INVALID_ID';
    throw err;
  }
  const doc = await CustomerDocument.findOne({
    _id: id,
    projectId,
    isActive: true,
  }).lean();
  if (!doc) {
    const err = new Error('Tài liệu không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const storageKey = String(doc.storageKey || '').trim();
  if (!storageKey) {
    const err = new Error('Tài liệu chưa có file trên storage');
    err.statusCode = 404;
    err.errorCode = 'DOCUMENT_NO_STORAGE';
    throw err;
  }
  const objectStorage = require('../utils/common/objectStorage');
  if (!objectStorage.isEnabled()) {
    const err = new Error('Object storage chưa bật — không tải được file');
    err.statusCode = 503;
    err.errorCode = 'OBJECT_STORAGE_DISABLED';
    throw err;
  }
  const stream = await objectStorage.getObjectStream(storageKey);
  return {
    stream,
    fileName: String(doc.filename || 'document.xlsx').slice(0, 260),
    mimeType: String(doc.mimeType || 'application/octet-stream').slice(0, 120),
    sizeBytes: doc.sizeBytes ?? null,
  };
}

async function createCustomerDocument({
  userId,
  projectId,
  body = {},
  fileBuffer = null,
  fileName = null,
  mimeType = null,  
  sizeBytes = null,
}) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:document_upload',
  });

  const hasBinary = Buffer.isBuffer(fileBuffer) && fileBuffer.length > 0;
  const filename = String(fileName || body.filename || '').trim();
  if (!filename) {
    const err = new Error('filename là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const docClass = CUSTOMER_DOC_CLASSES.includes(String(body.docClass || '').trim())
    ? String(body.docClass).trim()
    : 'other';

  let storageKey = String(body.storageKey || '').trim().slice(0, 512);
  let resolvedMime = String(mimeType || body.mimeType || '').trim().slice(0, 120);
  let resolvedSize =
    sizeBytes != null
      ? Number(sizeBytes)
      : body.sizeBytes != null
        ? Number(body.sizeBytes)
        : null;

  if (hasBinary) {
    if (!objectStorage.isEnabled()) {
      const err = new Error('Object storage (MinIO) chưa được cấu hình');
      err.statusCode = 503;
      err.errorCode = 'STORAGE_NOT_CONFIGURED';
      throw err;
    }
    storageKey = buildCustomerDocumentStoragePath({
      projectId,
      docClass,
      filename,
    });
    await objectStorage.putObject(
      storageKey,
      fileBuffer,
      resolvedMime || 'application/octet-stream'
    );
    if (resolvedSize == null) resolvedSize = fileBuffer.length;
  }

  const doc = await CustomerDocument.create({
    organizationId: project.organizationId,
    projectId,
    packId: null,
    filename: filename.slice(0, 260),
    mimeType: resolvedMime,
    storageKey,
    sizeBytes: resolvedSize,
    docClass,
    notes: String(body.notes || '').trim().slice(0, 2000),
    uploadedBy: userId,
  });
  return serializeDoc(doc);
}

/**
 * Pack-scoped upload (HITL before Project board).
 */
async function createCustomerDocumentForPack({
  userId,
  organizationId,
  packId,
  body = {},
  fileBuffer = null,
  fileName = null,
  mimeType = null,
  sizeBytes = null,
}) {
  const {
    assertRequirementImportOrCreateProjectScope,
  } = require('./requirementAccess.service');
  const RequirementPack = require('../models/RequirementPack');

  await assertRequirementImportOrCreateProjectScope({ userId, organizationId });

  const pack = await RequirementPack.findOne({
    _id: packId,
    organizationId,
    isActive: true,
  }).lean();
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const hasBinary = Buffer.isBuffer(fileBuffer) && fileBuffer.length > 0;
  const filename = String(fileName || body.filename || '').trim();
  if (!filename) {
    const err = new Error('filename là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const docClass = CUSTOMER_DOC_CLASSES.includes(String(body.docClass || '').trim())
    ? String(body.docClass).trim()
    : 'other';

  let storageKey = String(body.storageKey || '').trim().slice(0, 512);
  let resolvedMime = String(mimeType || body.mimeType || '').trim().slice(0, 120);
  let resolvedSize =
    sizeBytes != null
      ? Number(sizeBytes)
      : body.sizeBytes != null
        ? Number(body.sizeBytes)
        : null;

  if (hasBinary) {
    if (!objectStorage.isEnabled()) {
      const err = new Error('Object storage (MinIO) chưa được cấu hình');
      err.statusCode = 503;
      err.errorCode = 'STORAGE_NOT_CONFIGURED';
      throw err;
    }
    storageKey = buildCustomerDocumentStoragePath({
      packId,
      docClass,
      filename,
    });
    await objectStorage.putObject(
      storageKey,
      fileBuffer,
      resolvedMime || 'application/octet-stream'
    );
    if (resolvedSize == null) resolvedSize = fileBuffer.length;
  }

  const doc = await CustomerDocument.create({
    organizationId,
    projectId: null,
    packId,
    filename: filename.slice(0, 260),
    mimeType: resolvedMime,
    storageKey,
    sizeBytes: resolvedSize,
    docClass,
    notes: String(body.notes || '').trim().slice(0, 2000),
    uploadedBy: userId,
  });
  return serializeDoc(doc);
}

async function listCustomerDocumentsForPack({ userId, organizationId, packId }) {
  const { assertRequirementPermission } = require('./requirementAccess.service');
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:view',
  });
  const rows = await CustomerDocument.find({
    packId,
    organizationId,
    isActive: true,
  })
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(serializeDoc);
}

/**
 * After Gate 2 create-project — attach pack docs to the new board.
 */
async function linkPackDocumentsToProject({ organizationId, packId, projectId }) {
  const orgId = String(organizationId || '').trim();
  const pid = String(projectId || '').trim();
  const pack = String(packId || '').trim();
  if (!orgId || !pid || !pack) {
    return { matched: 0, modified: 0 };
  }
  const result = await CustomerDocument.updateMany(
    {
      organizationId: orgId,
      packId: pack,
      isActive: true,
      $or: [{ projectId: null }, { projectId: { $exists: false } }],
    },
    { $set: { projectId: pid } }
  );
  return {
    matched: result.matchedCount ?? result.n ?? 0,
    modified: result.modifiedCount ?? result.nModified ?? 0,
  };
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
  // PO (artifact_edit, no BA import): chỉ BG/SCOPE. BA (ba_review / submit) full kinds.
  if (PO_AUTHOR_KINDS.includes(k)) return;
  if (
    !hasPermission(permissions, 'analysis:submit_ba_review') &&
    !hasPermission(permissions, 'analysis:ba_review')
  ) {
    if (
      hasPermission(permissions, 'analysis:po_review') &&
      !hasPermission(permissions, 'analysis:ba_review')
    ) {
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
    await assertUserAnyProjectPermission({
      userId,
      projectId,
      permissions: ['analysis:artifact_edit', 'analysis:artifact_import'],
      message: 'Không có quyền sửa analysis artifact',
    });
  }
  const doc = await AnalysisArtifact.findOne({ _id: artifactId, projectId, isActive: true });
  if (!doc) {
    const err = new Error('Artifact không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (!isArtifactContentEditableStatus(doc.status)) {
    const err = new Error(
      'Chỉ sửa được artifact draft hoặc đang yêu cầu chỉnh sửa. Sau khi cắt SRS, đổi yêu cầu đã duyệt qua Change Request (Phase 2).'
    );
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
  if (!canResubmitFromChangesRequested(from, to, doc.changesRequestedFrom)) {
    const err = new Error(
      `Chỉ gửi lại về cổng ${doc.changesRequestedFrom || 'tech_review'} sau khi chỉnh sửa`
    );
    err.statusCode = 400;
    err.errorCode = 'ARTIFACT_RESUBMIT_GATE';
    throw err;
  }
  if (isReviewNoteRequired(to) && !String(note || '').trim()) {
    const err = new Error('Bắt buộc ghi lý do khi yêu cầu chỉnh sửa hoặc từ chối');
    err.statusCode = 400;
    err.errorCode = 'ARTIFACT_NOTE_REQUIRED';
    throw err;
  }
  const perm = permissionForArtifactTransition(from, to);
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const {
    projectHasAnalysisTechReviewer,
    assertGateStampSoD,
    notifyNextGateReviewers,
  } = require('../utils/phase1GatePolicy');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  const techRequired = await projectHasAnalysisTechReviewer(projectId);

  if (from === 'ba_review' && to === 'tech_review' && !techRequired && !bypass) {
    const err = new Error(
      'Project không có Tech Reviewer — duyệt thẳng sang po_review (skip Tech)'
    );
    err.statusCode = 409;
    err.errorCode = 'ARTIFACT_TECH_SKIP';
    throw err;
  }
  if (from === 'ba_review' && to === 'po_review' && techRequired && !bypass) {
    const err = new Error('Project có Tech Reviewer — phải qua tech_review trước');
    err.statusCode = 409;
    err.errorCode = 'ARTIFACT_TECH_REQUIRED';
    throw err;
  }

  if (!bypass && perm) {
    await assertAnalysisPerm({ userId, projectId, permission: perm });
  }
  // RULE-11: author cannot ba_review own artifact
  if (from === 'ba_review' && (to === 'tech_review' || to === 'po_review' || to === 'rejected' || to === 'changes_requested')) {
    if (String(doc.createdBy) === String(userId) && !bypass) {
      const err = new Error('Không được BA review artifact do chính mình tạo');
      err.statusCode = 403;
      err.errorCode = 'ARTIFACT_FOUR_EYES';
      throw err;
    }
  }

  const prior = [];
  if (from === 'tech_review') prior.push(doc.review?.ba);
  if (from === 'po_review') {
    prior.push(doc.review?.ba, doc.review?.tech);
  }
  if (to === 'approved' || to === 'po_review' || (from === 'tech_review' && to !== 'rejected')) {
    assertGateStampSoD({ actorUserId: userId, priorStamps: prior, bypass });
  }

  const gateNote = String(note || '').trim().slice(0, 1000);
  const stamp = { userId, at: new Date(), note: gateNote };
  if (from === 'ba_review' && (to === 'tech_review' || to === 'po_review' || to === 'rejected' || to === 'changes_requested')) {
    doc.review.ba = stamp;
    if (to === 'po_review' && !techRequired) {
      doc.review.tech = { skipped: true, at: new Date(), note: 'tech_optional_skip' };
    }
  }
  if (from === 'tech_review' && (to === 'po_review' || to === 'rejected' || to === 'changes_requested')) {
    doc.review.tech = stamp;
  }
  if (from === 'po_review' && (to === 'approved' || to === 'rejected' || to === 'changes_requested')) {
    doc.review.po = stamp;
  }
  if (to === 'changes_requested') {
    doc.changesRequestedFrom = from;
    doc.rejectionReason = gateNote;
  }
  if (to === 'rejected') {
    doc.rejectionReason = gateNote || doc.rejectionReason;
    doc.changesRequestedFrom = '';
  }
  if (from === 'changes_requested' && (to === 'ba_review' || to === 'tech_review' || to === 'po_review')) {
    doc.changesRequestedFrom = '';
  }
  doc.status = to;
  doc.updatedBy = userId;
  await doc.save();

  const project = await Project.findById(projectId).select('organizationId').lean();

  if (to === 'changes_requested') {
    try {
      const { notifySystemKind, projectHubActionUrl } = require('../clients/notification.client');
      const { userIdsWithProjectPermission } = require('../utils/phase1GatePolicy');
      const editors = await userIdsWithProjectPermission(projectId, 'analysis:artifact_edit');
      const authorId = String(doc.createdBy || '').trim();
      const targets = [...new Set([...(editors || []), authorId].filter(Boolean))];
      const kindSeg = (() => {
        const k = String(doc.kind || '')
          .trim()
          .toUpperCase();
        const map = {
          SCOPE: 'analysis-scope',
          BG: 'analysis-bg',
          BR: 'analysis-br',
          BPM: 'analysis-bpm',
          FR: 'analysis-fr',
          UC: 'analysis-uc',
          NFR: 'analysis-nfr',
          INTERFACE: 'analysis-interface',
          DATA: 'analysis-data',
          GLOSSARY: 'analysis-glossary',
          ASSUMPTION: 'analysis-assumption',
        };
        return map[k] || 'analysis-reviews';
      })();
      if (targets.length) {
        await notifySystemKind({
          userIds: targets,
          kind: 'analysis_changes_requested',
          title: 'Yêu cầu chỉnh sửa Analysis',
          content: `Artifact “${String(doc.title || doc.externalKey || '').trim() || '—'}” cần chỉnh sửa: ${gateNote.slice(0, 200)}`,
          data: {
            projectId: String(projectId),
            organizationId: String(project?.organizationId || ''),
            artifactId: String(doc._id),
            kind: 'analysis_changes_requested',
            artifactKind: String(doc.kind || ''),
            returnTo: from,
          },
          actionUrl: projectHubActionUrl({
            projectId,
            organizationId: project?.organizationId,
            pathSuffix: `${kindSeg}?artifact=${encodeURIComponent(String(doc._id))}`,
          }),
          excludeUserId: userId,
        });
      }
    } catch {
      /* non-blocking */
    }
  } else if (to === 'tech_review' || to === 'po_review') {
    const nextPermission =
      to === 'tech_review'
        ? 'analysis:tech_review'
        : 'analysis:po_review';
    await notifyNextGateReviewers({
      projectId,
      organizationId: project?.organizationId,
      actorUserId: userId,
      nextPermission,
      title: 'Artifact chờ duyệt',
      content: `Artifact “${String(doc.title || doc.externalKey || '').trim() || '—'}” chờ cổng tiếp theo.`,
      kind: 'analysis_gate_pending',
      actionPath: 'phase1/analysis-reviews',
    });
  }

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
  const bgs = byKind('BG');
  const brs = byKind('BR');
  const ucs = byKind('UC');
  const {
    summarizeTraceGaps,
  } = require('../utils/analysis/traceGaps');
  const {
    frMissingUc,
    brMissingBg,
    frMissingCr,
    bpmMissingBr,
  } = summarizeTraceGaps({ artifacts, links });
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
  const {
    evaluateReadyForPhase2,
    evaluateRaReadiness,
    summarizeReviewAttention,
  } = require('../constants/phase2Gate');
  const { coerceDeliveryPhase } = require('../constants/projectDeliveryPhase');

  let srsBaselineExists = false;
  let planningBaselineExists = false;
  let planningSummary = null;
  let planArts = [];
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
    planArts = await PlanningArtifact.find({ projectId, isActive: true }).lean();
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
    planArts = [];
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
  const { ANALYSIS_ARTIFACT_KINDS } = require('../constants/analysisArtifact');
  const { PLANNING_ARTIFACT_KINDS } = require('../constants/planningArtifact');
  const reviewAttention = summarizeReviewAttention({
    artifacts,
    allowedKinds: ANALYSIS_ARTIFACT_KINDS,
  });
  const planningReviewAttention = summarizeReviewAttention({
    artifacts: planArts,
    allowedKinds: PLANNING_ARTIFACT_KINDS,
  });

  const { constraints, assumptions } = await collectConstraintsAssumptions({
    projectId,
    artifacts,
  });

  const counts = {};
  for (const k of ANALYSIS_ARTIFACT_KINDS) {
    counts[k] = byKind(k).length;
  }

  return {
    counts,
    frMissingUc,
    brMissingBg,
    frMissingCr,
    bpmMissingBr,
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
    reviewAttention,
    planningReviewAttention,
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
  artifactIds = null,
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
  // Bulk chỉ cho Approve bước tiếp theo — không bulk Request changes / Reject (cần note từng item).
  if (to === 'changes_requested' || to === 'rejected' || from === 'changes_requested') {
    const err = new Error('Không bulk Yêu cầu chỉnh sửa / Từ chối — dùng chuyển từng artifact kèm lý do');
    err.statusCode = 400;
    err.errorCode = 'ARTIFACT_BULK_NOTE_REQUIRED';
    throw err;
  }

  const perm = permissionForArtifactTransition(from, to);
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  if (!bypass && perm) {
    await assertAnalysisPerm({ userId, projectId, permission: perm });
  }

  const {
    buildBulkTransitionFilter,
  } = require('../utils/analysis/bulkTransitionArtifactIds');

  const gateNote = String(note || '').trim().slice(0, 1000);
  const stamp = { userId, at: new Date(), note: gateNote };
  let skippedFourEyes = 0;

  // Four-eyes: BA cannot promote own artifact to tech_review
  let excludeCreatedBy = null;
  if (from === 'ba_review' && to === 'tech_review' && !bypass) {
    const baseFilter = buildBulkTransitionFilter({
      projectId,
      fromStatus: from,
      artifactIds,
    }).filter;
    const ownCount = await AnalysisArtifact.countDocuments({
      ...baseFilter,
      createdBy: userId,
    });
    skippedFourEyes = ownCount;
    excludeCreatedBy = userId;
  }

  const { filter, idFilterActive } = buildBulkTransitionFilter({
    projectId,
    fromStatus: from,
    artifactIds,
    excludeCreatedBy,
  });

  if (idFilterActive && (!filter._id || !filter._id.$in?.length)) {
    return {
      fromStatus: from,
      toStatus: to,
      candidateCount: 0,
      updated: 0,
      skipped: 0,
      skippedReasons: [],
      truncated: false,
      idFilter: true,
    };
  }

  const candidateCount = await AnalysisArtifact.countDocuments(
    idFilterActive
      ? filter
      : { projectId, isActive: true, status: from }
  );

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
    skipped: Math.max(0, candidateCount - updated) + skippedFourEyes,
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
    idFilter: idFilterActive,
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
    .select('kind externalKey status source title summary structured')
    .lean();
  const existingByKey = new Map(existingRows.map((a) => [`${a.kind}::${a.externalKey}`, a]));
  const pendingCreates = [];
  const pendingStructuredMerges = [];

  const isEmptyStructuredValue = (v) => {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    return String(v).trim() === '';
  };

  const upsert = async (payload) => {
    const key = `${payload.kind}::${payload.externalKey}`;
    const existing = existingByKey.get(key);
    if (existing) {
      // Re-import: backfill structured trống trên draft seed — không đè giá trị BA đã sửa.
      const st = String(existing.status || '').toLowerCase();
      const src = String(existing.source || '');
      if (st === 'draft' && src === 'seed_from_pack' && payload.structured) {
        const prev =
          existing.structured && typeof existing.structured === 'object' ? existing.structured : {};
        const next = { ...prev };
        let changed = false;
        for (const [sk, sv] of Object.entries(payload.structured)) {
          if (isEmptyStructuredValue(sv)) continue;
          if (!isEmptyStructuredValue(next[sk])) continue;
          next[sk] = sv;
          changed = true;
        }
        const titleEmpty = !String(existing.title || '').trim() && String(payload.title || '').trim();
        const summaryEmpty =
          !String(existing.summary || '').trim() && String(payload.summary || '').trim();
        if (changed || titleEmpty || summaryEmpty) {
          pendingStructuredMerges.push({
            _id: existing._id,
            structured: next,
            title: titleEmpty ? payload.title : undefined,
            summary: summaryEmpty ? payload.summary : undefined,
          });
        }
      }
      return;
    }
    existingByKey.set(key, {
      kind: payload.kind,
      externalKey: payload.externalKey,
      status: 'draft',
      source: 'seed_from_pack',
    });
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

  const businessGoals = Array.isArray(pack.businessGoals) ? pack.businessGoals : [];
  // Overview-derived BG-001 is only a legacy fallback. When 02_BG rows exist, do not
  // pre-claim BG-001 (would skip the full Excel row via existingKeys).
  const overview = pack.overview || {};
  if (
    businessGoals.length === 0 &&
    (overview.projectObjective || overview.businessScope)
  ) {
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
      structured: {
        scopeType: type,
        description: desc,
        source: String(row.source || '').slice(0, 240),
        dateRaised: String(row.dateRaised || '').slice(0, 64),
        status: String(row.status || '').slice(0, 64),
        baNote: String(row.baNote || '').slice(0, 2000),
        customerRequirementIds: Array.isArray(row.customerRequirementIds)
          ? row.customerRequirementIds
          : [],
      },
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
        evidenceIds: Array.isArray(fr.evidenceIds) ? fr.evidenceIds.map(String).slice(0, 20) : [],
        groundingStatus: fr.groundingStatus ? String(fr.groundingStatus) : undefined,
        groundingScore:
          fr.groundingScore != null && Number.isFinite(Number(fr.groundingScore))
            ? Number(fr.groundingScore)
            : undefined,
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
        requirement: nfr.requirement || nfr.name || '',
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
        evidenceIds: Array.isArray(nfr.evidenceIds)
          ? nfr.evidenceIds.map(String).slice(0, 20)
          : [],
        groundingStatus: nfr.groundingStatus ? String(nfr.groundingStatus) : undefined,
        groundingScore:
          nfr.groundingScore != null && Number.isFinite(Number(nfr.groundingScore))
            ? Number(nfr.groundingScore)
            : undefined,
        relatedFrKeys: Array.isArray(nfr.relatedFrIds)
          ? nfr.relatedFrIds
          : String(nfr.relatedFr || '')
              .split(/[,;]+/)
              .map((s) => s.trim())
              .filter(Boolean),
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
  const usedBpmKeys = new Set();
  for (const bpm of businessProcesses) {
    const externalKey = String(bpm.externalId || bpm.externalKey || '').trim();
    if (!externalKey) continue;
    const step = String(bpm.step || '').trim();
    let key = step ? `${externalKey}-S${step}` : externalKey;
    // Tránh nuốt dòng khi Excel trùng BPM ID + Step (vd. hai quy trình cùng BPM-002-S1).
    if (usedBpmKeys.has(key) || existingByKey.has(`BPM::${key}`)) {
      const suffix = String(bpm._rowNumber || usedBpmKeys.size + 1);
      key = `${key}-${suffix}`.slice(0, 64);
    }
    usedBpmKeys.add(key);
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

  const interfaces = Array.isArray(pack.interfaces) ? pack.interfaces : [];
  for (const row of interfaces) {
    const externalKey = String(row.externalId || row.externalKey || '').trim();
    if (!externalKey) continue;
    const name = String(row.name || row.interfaceName || externalKey).trim();
    await upsert({
      kind: 'INTERFACE',
      externalKey,
      title: name.slice(0, 240),
      summary: String(row.description || '').slice(0, 2000),
      structured: {
        interfaceName: name,
        interfaceType: String(row.interfaceType || '').slice(0, 120),
        direction: String(row.direction || 'inout').slice(0, 64),
        protocol: String(row.protocol || '').slice(0, 120),
        description: String(row.description || ''),
        relatedArtifactIds: Array.isArray(row.relatedArtifactIds) ? row.relatedArtifactIds : [],
        customerRequirementIds: Array.isArray(row.customerRequirementIds)
          ? row.customerRequirementIds
          : [],
        status: String(row.status || '').slice(0, 64),
        baNote: String(row.baNote || '').slice(0, 2000),
      },
    });
  }

  const dataEntities = Array.isArray(pack.dataEntities) ? pack.dataEntities : [];
  for (const row of dataEntities) {
    const externalKey = String(row.externalId || row.externalKey || '').trim();
    if (!externalKey) continue;
    const entity = String(row.entity || externalKey).trim();
    await upsert({
      kind: 'DATA',
      externalKey,
      title: entity.slice(0, 240),
      summary: String(row.attributes || '').slice(0, 2000),
      structured: {
        entity,
        attributes: String(row.attributes || ''),
        validationRules: String(row.validationRules || ''),
        description: String(row.description || ''),
        relatedArtifactIds: Array.isArray(row.relatedArtifactIds) ? row.relatedArtifactIds : [],
        customerRequirementIds: Array.isArray(row.customerRequirementIds)
          ? row.customerRequirementIds
          : [],
        status: String(row.status || '').slice(0, 64),
        baNote: String(row.baNote || '').slice(0, 2000),
      },
    });
  }

  const glossaryRows = Array.isArray(pack.glossary) ? pack.glossary : [];
  for (const row of glossaryRows) {
    const term = String(row.term || '').trim();
    if (!term) continue;
    const externalKey = String(row.externalId || row.externalKey || '').trim() || `GL-${term}`;
    await upsert({
      kind: 'GLOSSARY',
      externalKey: externalKey.slice(0, 120),
      title: term.slice(0, 240),
      summary: String(row.definition || '').slice(0, 2000),
      structured: {
        term,
        definition: String(row.definition || ''),
        relatedArtifactIds: Array.isArray(row.relatedArtifactIds) ? row.relatedArtifactIds : [],
        status: String(row.status || '').slice(0, 64),
        baNote: String(row.baNote || '').slice(0, 2000),
      },
    });
  }

  const assumptionRows = Array.isArray(pack.assumptions) ? pack.assumptions : [];
  let asmSeq = 0;
  for (const row of assumptionRows) {
    if (!row || typeof row !== 'object') continue;
    const text = String(row.text || row.assumption || '').trim();
    if (!text) continue;
    asmSeq += 1;
    const externalKey =
      String(row.externalId || row.externalKey || '').trim() ||
      `ASM-${String(asmSeq).padStart(3, '0')}`;
    await upsert({
      kind: 'ASSUMPTION',
      externalKey: externalKey.slice(0, 120),
      title: text.slice(0, 240),
      summary: String(row.impactIfInvalid || '').slice(0, 2000),
      structured: {
        text,
        impactIfInvalid: String(row.impactIfInvalid || ''),
        relatedArtifactIds: Array.isArray(row.relatedArtifactIds) ? row.relatedArtifactIds : [],
        customerRequirementIds: Array.isArray(row.customerRequirementIds)
          ? row.customerRequirementIds
          : [],
        status: String(row.status || '').slice(0, 64),
        baNote: String(row.baNote || '').slice(0, 2000),
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

  if (pendingStructuredMerges.length) {
    await Promise.all(
      pendingStructuredMerges.map((row) => {
        const $set = { structured: row.structured, updatedBy: userId };
        if (row.title != null) $set.title = row.title;
        if (row.summary != null) $set.summary = row.summary;
        return AnalysisArtifact.updateOne({ _id: row._id, projectId, isActive: true }, { $set });
      })
    );
    seeded += pendingStructuredMerges.length;
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
  // Wave B/C — formal links from seeded artifact soft keys
  const asKeys = (value) => {
    if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
    if (value == null || value === '') return [];
    return String(value)
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  };
  const bpmKeysMatching = (prefix) => {
    const p = String(prefix || '').trim();
    if (!p) return [];
    const out = [];
    for (const key of artByKey.keys()) {
      if (key === p || key.startsWith(`${p}-`)) out.push(key);
    }
    return out;
  };
  for (const art of allArts) {
    const ek = String(art.externalKey || '').trim();
    if (!ek) continue;
    const st = art.structured && typeof art.structured === 'object' ? art.structured : {};
    if (art.kind === 'FR') {
      for (const brId of asKeys(st.brIds)) queueLink(ek, brId, 'implements');
      for (const bpmPrefix of asKeys(st.bpmIds)) {
        for (const bpmKey of bpmKeysMatching(bpmPrefix)) {
          queueLink(ek, bpmKey, 'implements');
        }
      }
    }
    if (art.kind === 'BPM') {
      const brKey = String(st.relatedBrKey || st.relatedBr || '').trim();
      if (brKey) queueLink(ek, brKey, 'derives');
    }
    if (art.kind === 'NFR') {
      for (const frKey of asKeys(st.relatedFrKeys)) {
        queueLink(ek, frKey, 'constrains');
      }
    }
    if (art.kind === 'SCOPE') {
      // Formal scopes when target Analysis ID matches soft CR/analysis key (rare); soft CR still shown on hub.
      for (const targetKey of asKeys(st.customerRequirementIds)) {
        queueLink(ek, targetKey, 'scopes');
      }
      for (const targetKey of asKeys(st.relatedArtifactIds || st.relatedArtifactKeys)) {
        queueLink(ek, targetKey, 'scopes');
      }
    }
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
  /** DEC D1 — materialize board Tasks from WBS leaves after publish */
  seedBoardTasks = true,
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
  let boardSeed = null;

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

  if (seedBoardTasks) {
    try {
      const deliveryPlanningService = require('./deliveryPlanning.service');
      boardSeed = await deliveryPlanningService.seedBoardTasksFromPublishedWbs({
        userId,
        projectId,
      });
      if (
        boardSeed &&
        boardSeed.leafCount > 0 &&
        boardSeed.created === 0 &&
        !boardSeed.existingFromWbs &&
        !(boardSeed.skipped || []).length
      ) {
        const err = new Error(
          boardSeed.message || 'Không seed được Task từ WBS leaf — kiểm tra Planning publish'
        );
        err.statusCode = 400;
        err.errorCode = 'PHASE2_SEED_TASKS_EMPTY';
        err.details = boardSeed;
        throw err;
      }
    } catch (e) {
      if (e.errorCode === 'PHASE2_SEED_TASKS_EMPTY') throw e;
      boardSeed = { created: 0, error: e.message, errorCode: e.errorCode };
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
  // Lifecycle status is orthogonal to deliveryPhase but must stay in Project enum
  // (draft | active | on_hold | closed). Coerce legacy 5-value statuses.
  const { coerceProjectLifecycleStatus } = require('../utils/project/projectInitFields');
  const st = String(projectDoc.status || '').trim().toLowerCase();
  const coerced = coerceProjectLifecycleStatus(st);
  if (coerced === 'draft' || st === 'planning' || st === 'ready_for_planning') {
    projectDoc.status = 'active';
  } else if (coerced) {
    projectDoc.status = coerced;
  } else if (!['draft', 'active', 'on_hold', 'closed'].includes(st)) {
    projectDoc.status = 'active';
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
    boardSeed,
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
 * Export SRS working set or a baseline as IEEE-mapped xlsx buffer.
 * @param {{ userId: string, projectId: string, baselineId?: string, srsVersion?: string }} args
 */
async function exportSrsWorkbook({ userId, projectId, baselineId, srsVersion }) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({ userId, projectId, permission: 'analysis:view' });

  let baseline = null;
  let artifacts = [];
  if (baselineId) {
    baseline = await SrsBaseline.findOne({ _id: baselineId, projectId, isActive: true }).lean();
    if (!baseline) {
      const err = new Error('SRS Baseline không tồn tại');
      err.statusCode = 404;
      throw err;
    }
    const ids = Array.isArray(baseline.artifactIds) ? baseline.artifactIds : [];
    artifacts = ids.length
      ? await AnalysisArtifact.find({ _id: { $in: ids }, projectId }).lean()
      : [];
    // Fallback: snapshot-only (artifact soft-deleted) — rebuild minimal rows
    if (!artifacts.length && Array.isArray(baseline.artifactSnapshot)) {
      artifacts = baseline.artifactSnapshot.map((s) => ({
        _id: s.artifactId,
        kind: s.kind,
        externalKey: s.externalKey,
        title: s.title,
        version: s.version,
        structured: {},
        summary: '',
      }));
    }
  } else {
    artifacts = await AnalysisArtifact.find({
      projectId,
      isActive: true,
      status: 'approved',
    })
      .sort({ kind: 1, externalKey: 1 })
      .lean();
  }

  let traceLinks = [];
  try {
    const links = await ArtifactTraceLink.find({ projectId }).lean();
    const idSet = new Set(artifacts.map((a) => String(a._id)));
    const byId = new Map(artifacts.map((a) => [String(a._id), a]));
    // Also load any referenced artifacts for keys
    const allIds = [
      ...new Set(
        links.flatMap((l) => [String(l.fromArtifactId || ''), String(l.toArtifactId || '')]).filter(Boolean)
      ),
    ];
    const extra = await AnalysisArtifact.find({ _id: { $in: allIds }, projectId })
      .select('_id kind externalKey')
      .lean();
    for (const a of extra) byId.set(String(a._id), a);
    traceLinks = links.map((l) => {
      const from = byId.get(String(l.fromArtifactId));
      const to = byId.get(String(l.toArtifactId));
      return {
        fromKind: from?.kind || '',
        fromKey: from?.externalKey || '',
        toKind: to?.kind || '',
        toKey: to?.externalKey || '',
        linkType: l.linkType,
      };
    });
    void idSet;
  } catch {
    traceLinks = [];
  }

  const { buildSrsExportWorkbook } = require('../utils/requirement/srsBaselineExportWorkbook');
  const buffer = await buildSrsExportWorkbook({
    project,
    srsVersion: srsVersion || baseline?.srsVersion || 'working',
    artifacts,
    traceLinks,
    baseline,
  });
  return {
    buffer,
    fileName: `SRS_${String(project.code || projectId).slice(0, 32)}_${String(srsVersion || baseline?.srsVersion || 'working').replace(/[^\w.-]+/g, '_')}.xlsx`,
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
  // Coerce legacy status so save() validates against draft|active|on_hold|closed.
  const { coerceProjectLifecycleStatus } = require('../utils/project/projectInitFields');
  const coercedStatus = coerceProjectLifecycleStatus(projectDoc.status);
  if (coercedStatus) {
    projectDoc.status = coercedStatus;
  } else if (!['draft', 'active', 'on_hold', 'closed'].includes(String(projectDoc.status || ''))) {
    projectDoc.status = 'draft';
  }
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
  const { mapParsedToPackPayload } = require('../utils/requirement/mapParsedToPackPayload');

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
  if (!analysisBuffer || analysisBuffer.length === 0) {
    const err = new Error(
      'Thiếu nội dung file Analysis — upload lại trước khi confirm (không tạo key pending/ ảo)'
    );
    err.statusCode = 400;
    err.errorCode = 'STORAGE_REQUIRED';
    throw err;
  }
  const stored = await importSetService.persistImportSetFileBuffer({
    projectId,
    setId: draftSet._id,
    slot: 'analysis',
    fileName: session.fileName || 'Requirement_Analysis.xlsx',
    mimeType: analysisMime,
    buffer: analysisBuffer,
  });
  if (!stored?.storageKey) {
    const err = new Error('Không lưu được file Analysis lên object storage');
    err.statusCode = 503;
    err.errorCode = 'STORAGE_REQUIRED';
    throw err;
  }
  const analysisStorageKey = stored.storageKey;
  const analysisContentHash = stored.contentHash || '';
  const analysisSize = stored.sizeBytes ?? analysisBuffer.length;

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
    // Seed draft ngay khi stage — BA chỉnh trên tab FR/BG… trước khi set ACTIVE.
    // Publish (PO) chỉ activate set; seed idempotent theo kind::externalKey.
    const seeded = await seedArtifactsFromRequirementPack({
      userId,
      projectId,
      pack: pack.toObject ? pack.toObject() : pack,
      importSetId: draftSet._id,
      sourceDocumentId: analysisDoc._id,
    });
    seededCount = seeded.seeded || 0;
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
  downloadCustomerDocument,
  createCustomerDocument,
  createCustomerDocumentForPack,
  listCustomerDocumentsForPack,
  linkPackDocumentsToProject,
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
  exportSrsWorkbook,
  startDeliveryPlanning,
  previewAnalysisImport,
  confirmAnalysisImport,
};
