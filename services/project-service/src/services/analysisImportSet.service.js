const { logger } = require('@enterprise/shared');
const Project = require('../models/Project');
const ProjectMembership = require('../models/ProjectMembership');
const AnalysisImportSet = require('../models/AnalysisImportSet');
const CustomerDocument = require('../models/CustomerDocument');
const AnalysisArtifact = require('../models/AnalysisArtifact');
const RequirementPack = require('../models/RequirementPack');
const ArtifactTraceLink = require('../models/ArtifactTraceLink');
const objectStorage = require('../utils/common/objectStorage');
const {
  isProjectRbacV2Enabled,
} = require('../utils/project/projectPermissionMatrix');
const {
  assertUserProjectPermission,
  resolveUserProjectPermissions,
  hasPermission,
} = require('./projectAccess.service');
const { recordAudit } = require('./audit.service');
const {
  assertCanAttachRaw,
  assertCanAttachAnalysis,
  assertCanActivate,
  assertCanRestore,
  planActivateSwap,
  planRestoreSwap,
  IMPORT_SET_ERROR_CODES,
  computeRetention,
  planSetTransition,
  assertCanPublish,
  planArtifactQueueAfterSetGate,
} = require('../constants/analysisImportSet');
const { CUSTOMER_RAW_TEMPLATE_TYPE } = require('../constants/customerRawTemplate.constants');
const {
  peekWorkbookTemplateType,
} = require('../utils/requirement/requirementAnalysisTemplateParse');
const {
  DELETED_REASON_SET_CASCADE,
  buildDeletedBatchId,
  buildMemberRestoreFilter,
} = require('../utils/analysis/importSetTrashBatch');
const {
  buildImportSetObjectKey,
  sha256Hex,
} = require('../utils/analysis/importSetStorage');
const { pickManualEditedForDiff } = require('../utils/analysis/importSetDiff');

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
  // Raw/Analysis upload + confirm: BA role matrix (không creator dump)
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

async function appendImportSetAudit({
  organizationId,
  actorUserId,
  action,
  setId,
  meta = {},
}) {
  return recordAudit({
    organizationId,
    actorUserId,
    action,
    resourceType: 'analysis_import_set',
    resourceId: String(setId),
    meta,
  });
}

function serializeReviewGate(stamp) {
  if (!stamp?.userId || !stamp?.at) return null;
  return {
    userId: String(stamp.userId),
    at: stamp.at,
    note: stamp.note || '',
  };
}

function serializeSet(doc, extras = {}) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const retention = computeRetention(o.trashedAt);
  return {
    id: String(o._id),
    organizationId: o.organizationId ? String(o.organizationId) : null,
    projectId: o.projectId ? String(o.projectId) : null,
    status: o.status,
    rawDocumentId: o.rawDocumentId ? String(o.rawDocumentId) : null,
    analysisDocumentId: o.analysisDocumentId ? String(o.analysisDocumentId) : null,
    packId: o.packId ? String(o.packId) : null,
    createdAt: o.createdAt || null,
    updatedAt: o.updatedAt || null,
    trashedAt: o.trashedAt || null,
    deletedAt: o.deletedAt || null,
    purgeAfterAt: o.purgeAfterAt || retention.purgeAfterAt,
    retentionDaysLeft: retention.retentionDaysLeft,
    review: {
      ba: serializeReviewGate(o.review?.ba),
      tech: serializeReviewGate(o.review?.tech),
      po: serializeReviewGate(o.review?.po),
    },
    ...extras,
  };
}

function serializeDocMeta(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(o._id),
    filename: o.filename || '',
    docClass: o.docClass || '',
    mimeType: o.mimeType || '',
    sizeBytes: o.sizeBytes ?? null,
  };
}

async function enrichSet(setLean) {
  if (!setLean) return null;
  const [raw, analysis, artifactCount] = await Promise.all([
    setLean.rawDocumentId
      ? CustomerDocument.findById(setLean.rawDocumentId).lean()
      : null,
    setLean.analysisDocumentId
      ? CustomerDocument.findById(setLean.analysisDocumentId).lean()
      : null,
    AnalysisArtifact.countDocuments({
      importSetId: setLean._id,
      isActive: setLean.status !== 'trashed',
    }),
  ]);
  return serializeSet(setLean, {
    rawDocument: serializeDocMeta(raw),
    analysisDocument: serializeDocMeta(analysis),
    artifactCount,
  });
}

/**
 * Idempotent: sau BA stamp Import Set, mở hàng chờ artifact (draft|ba_review → tech_review|po_review).
 * Gọi khi BA gate transition và khi list pending sets (backfill set đã stamp trước fix).
 */
async function syncArtifactReviewQueueFromSetGate(setDoc, { techRequired = true, actorUserId = null } = {}) {
  const { hasGateStamp } = require('../constants/analysisImportSet');
  const review = setDoc?.review || {};
  if (!hasGateStamp(review.ba)) return { modifiedCount: 0 };
  // Artifact dual-gate độc lập Import Set: draft sót (BPM seed muộn, miss sync) vẫn kéo lên
  // tech/po queue kể cả khi set đã stamp Tech — Tech stamp set ≠ duyệt hết artifact.
  const queueTo = planArtifactQueueAfterSetGate({
    setGateTo: 'tech_review',
    techRequired,
  });
  if (!queueTo) return { modifiedCount: 0 };

  const baStamp = {
    userId: review.ba.userId,
    at: review.ba.at || new Date(),
    note: review.ba.note || 'import_set_ba_gate',
  };
  const $set = {
    status: queueTo,
    updatedAt: new Date(),
    'review.ba': baStamp,
  };
  if (actorUserId) $set.updatedBy = actorUserId;
  if (queueTo === 'po_review' && !techRequired) {
    $set['review.tech'] = {
      skipped: true,
      at: new Date(),
      note: 'tech_optional_skip',
    };
  }
  const result = await AnalysisArtifact.updateMany(
    {
      projectId: setDoc.projectId,
      importSetId: setDoc._id,
      isActive: true,
      status: { $in: ['draft', 'ba_review'] },
    },
    { $set }
  );
  return { modifiedCount: result?.modifiedCount || 0, queueTo };
}

async function findActiveSet(projectId) {
  return AnalysisImportSet.findOne({ projectId, status: 'active' });
}

async function ensureDraftImportSet({ userId, projectId, organizationId }) {
  let draft = await AnalysisImportSet.findOne({ projectId, status: 'draft' });
  if (draft) return draft;
  try {
    draft = await AnalysisImportSet.create({
      organizationId,
      projectId,
      status: 'draft',
      createdBy: userId,
      updatedBy: userId,
    });
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || '').includes('duplicate'))) {
      draft = await AnalysisImportSet.findOne({ projectId, status: 'draft' });
      if (draft) return draft;
    }
    throw err;
  }
  return draft;
}

async function persistImportSetFileBuffer({
  projectId,
  setId,
  slot,
  fileName,
  mimeType,
  buffer,
}) {
  const contentHash = sha256Hex(buffer);
  if (!buffer?.length) {
    const err = new Error('File rỗng — không lưu Import Set');
    err.statusCode = 400;
    err.errorCode = IMPORT_SET_ERROR_CODES.STORAGE_REQUIRED;
    throw err;
  }
  if (!objectStorage.isEnabled()) {
    const err = new Error('Object storage (MinIO) chưa bật — không thể lưu file Import Set');
    err.statusCode = 503;
    err.errorCode = IMPORT_SET_ERROR_CODES.STORAGE_REQUIRED;
    throw err;
  }
  const storageKey = buildImportSetObjectKey({ projectId, setId, slot, fileName });
  try {
    await objectStorage.putObject(storageKey, buffer, mimeType);
  } catch (uploadErr) {
    logger.error(
      `analysisImportSet MinIO putObject failed set=${setId} slot=${slot}: ${uploadErr.message}`
    );
    const err = new Error('Không lưu được file lên storage — thử lại sau');
    err.statusCode = 503;
    err.errorCode = IMPORT_SET_ERROR_CODES.STORAGE_REQUIRED;
    throw err;
  }
  return { storageKey, contentHash, sizeBytes: buffer.length };
}

function memberTrashUpdate(userId, now, batchId) {
  return {
    $set: {
      isActive: false,
      deletedAt: now,
      deletedBy: userId,
      deletedReason: DELETED_REASON_SET_CASCADE,
      deletedBatchId: batchId,
    },
  };
}

function memberRestoreUpdate(userId) {
  return {
    $set: {
      isActive: true,
      deletedAt: null,
      deletedBy: null,
      deletedReason: '',
      deletedBatchId: '',
    },
  };
}

/**
 * Cascade soft-delete all members of an Import Set (RULE-03).
 */
async function cascadeTrashMembers({ importSetId, userId, now, deletedBatchId }) {
  const setId = importSetId;
  const batchId = deletedBatchId || buildDeletedBatchId(setId, now.getTime());
  const trashUp = memberTrashUpdate(userId, now, batchId);

  await CustomerDocument.updateMany({ importSetId: setId, isActive: true }, trashUp);
  await RequirementPack.updateMany({ importSetId: setId, isActive: true }, trashUp);

  const arts = await AnalysisArtifact.find({ importSetId: setId, isActive: true })
    .select('_id')
    .lean();
  const artIds = arts.map((a) => a._id);
  if (artIds.length) {
    await AnalysisArtifact.updateMany(
      { _id: { $in: artIds } },
      {
        $set: {
          isActive: false,
          updatedBy: userId,
          deletedAt: now,
          deletedBy: userId,
          deletedReason: DELETED_REASON_SET_CASCADE,
          deletedBatchId: batchId,
        },
      }
    );
    await ArtifactTraceLink.updateMany(
      {
        isActive: true,
        $or: [{ fromArtifactId: { $in: artIds } }, { toArtifactId: { $in: artIds } }],
      },
      {
        $set: {
          isActive: false,
          deletedAt: now,
          deletedBy: userId,
          deletedBatchId: batchId,
        },
      }
    );
  }
  return batchId;
}

/**
 * Cascade restore members when bringing a set back to active (RULE-04).
 */
async function cascadeRestoreMembers({ importSetId, userId, deletedBatchId }) {
  const restoreFilter = buildMemberRestoreFilter(importSetId, deletedBatchId);
  const restoreUp = memberRestoreUpdate(userId);

  await CustomerDocument.updateMany(restoreFilter, restoreUp);
  await RequirementPack.updateMany(restoreFilter, restoreUp);

  const arts = await AnalysisArtifact.find({
    importSetId,
    deletedReason: DELETED_REASON_SET_CASCADE,
    ...(deletedBatchId ? { deletedBatchId } : { deletedBatchId: { $in: [null, ''] } }),
  })
    .select('_id')
    .lean();
  const artIds = arts.map((a) => a._id);
  if (artIds.length) {
    await AnalysisArtifact.updateMany(
      { _id: { $in: artIds } },
      {
        $set: {
          isActive: true,
          updatedBy: userId,
          deletedAt: null,
          deletedBy: null,
          deletedReason: '',
          deletedBatchId: '',
        },
      }
    );
    await ArtifactTraceLink.updateMany(
      {
        deletedBatchId: deletedBatchId || { $in: [null, ''] },
        $or: [{ fromArtifactId: { $in: artIds } }, { toArtifactId: { $in: artIds } }],
      },
      {
        $set: {
          isActive: true,
          deletedAt: null,
          deletedBy: null,
          deletedBatchId: '',
        },
      }
    );
  }
}

async function markSetTrashed(setDoc, userId, now) {
  const batchId = buildDeletedBatchId(setDoc._id, now.getTime());
  setDoc.status = 'trashed';
  setDoc.trashedAt = now;
  setDoc.deletedAt = now;
  setDoc.deletedBy = userId;
  setDoc.lastTrashBatchId = batchId;
  const { purgeAfterAt } = computeRetention(now);
  setDoc.purgeAfterAt = purgeAfterAt;
  setDoc.updatedBy = userId;
  await setDoc.save();
  await cascadeTrashMembers({
    importSetId: setDoc._id,
    userId,
    now,
    deletedBatchId: batchId,
  });
  await appendImportSetAudit({
    organizationId: setDoc.organizationId,
    actorUserId: userId,
    action: 'import_set_trash',
    setId: setDoc._id,
    meta: { deletedBatchId: batchId },
  });
  logger.info(
    `analysisImportSet trashed set=${setDoc._id} project=${setDoc.projectId} batch=${batchId} by=${userId}`
  );
}

async function markSetActive(setDoc, userId, { revertedFromSetId = null } = {}) {
  const batchId = setDoc.lastTrashBatchId || null;
  setDoc.status = 'active';
  setDoc.trashedAt = null;
  setDoc.deletedAt = null;
  setDoc.deletedBy = null;
  setDoc.purgeAfterAt = null;
  if (revertedFromSetId) {
    setDoc.revertedFromSetId = revertedFromSetId;
  }
  setDoc.updatedBy = userId;
  await setDoc.save();
  await cascadeRestoreMembers({
    importSetId: setDoc._id,
    userId,
    deletedBatchId: batchId,
  });
  await appendImportSetAudit({
    organizationId: setDoc.organizationId,
    actorUserId: userId,
    action: revertedFromSetId ? 'import_set_revert' : 'import_set_activate',
    setId: setDoc._id,
    meta: { deletedBatchId: batchId, revertedFromSetId: revertedFromSetId || null },
  });
  logger.info(
    `analysisImportSet activated set=${setDoc._id} project=${setDoc.projectId} batch=${batchId} by=${userId}`
  );
}

async function assertTechReviewerExists(projectId) {
  if (!isProjectRbacV2Enabled()) return;
  const memberships = await ProjectMembership.find({ projectId }).select('userId').lean();
  for (const m of memberships) {
    const resolved = await resolveUserProjectPermissions({
      userId: m.userId,
      projectId,
    });
    if (hasPermission(resolved.permissions, 'analysis:tech_review')) {
      return;
    }
  }
  const err = new Error(
    'Project chưa có thành viên với quyền Tech Review — gán Technical Lead hoặc Solution Architect'
  );
  err.statusCode = 422;
  err.errorCode = IMPORT_SET_ERROR_CODES.TECH_REVIEWER_REQUIRED;
  throw err;
}

async function listImportSets({ userId, projectId, status }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({ userId, projectId, permission: 'analysis:view' });
  await purgeOrphanEmptyDrafts(projectId);
  const filter = { projectId };
  const st = String(status || '').trim().toLowerCase();
  const allowed = ['draft', 'pending_review', 'rejected', 'active', 'trashed'];
  if (st && allowed.includes(st)) {
    filter.status = st;
  }
  const rows = await AnalysisImportSet.find(filter).sort({ updatedAt: -1 }).lean();
  const { projectHasAnalysisTechReviewer } = require('../utils/phase1GatePolicy');
  let techRequired = true;
  try {
    techRequired = await projectHasAnalysisTechReviewer(projectId);
  } catch {
    techRequired = true;
  }
  for (const row of rows) {
    // Backfill draft sót cả khi set đã active (PO đã stamp set) — dual-gate artifact độc lập.
    if (row.status !== 'pending_review' && row.status !== 'active') continue;
    try {
      await syncArtifactReviewQueueFromSetGate(row, { techRequired, actorUserId: userId });
    } catch (e) {
      logger.warn('[ImportSet] sync artifact queue on list failed', {
        setId: String(row._id),
        err: e?.message,
      });
    }
  }
  return Promise.all(rows.map((r) => enrichSet(r)));
}

async function attachRawDocument({
  userId,
  projectId,
  fileBuffer,
  fileName,
  mimeType,
  sizeBytes,
}) {
  const project = await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:document_upload',
  });

  const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer || []);
  const peeked = peekWorkbookTemplateType(buffer);
  const normalized = String(peeked || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (normalized !== String(CUSTOMER_RAW_TEMPLATE_TYPE).toLowerCase()) {
    const err = new Error(
      `File Raw phải có TemplateType=${CUSTOMER_RAW_TEMPLATE_TYPE} (nhận: ${peeked || 'empty'})`
    );
    err.statusCode = 400;
    err.errorCode = 'IMPORT_SET_INVALID_RAW_TEMPLATE';
    throw err;
  }

  const draft = await ensureDraftImportSet({
    userId,
    projectId,
    organizationId: project.organizationId,
  });
  assertCanAttachRaw(draft);

  const mime =
    String(mimeType || '').trim().slice(0, 120) ||
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  let storageKey;
  let contentHash;
  let storedSize;
  try {
    ({ storageKey, contentHash, sizeBytes: storedSize } = await persistImportSetFileBuffer({
      projectId,
      setId: draft._id,
      slot: 'raw',
      fileName: fileName || 'Customer_Requirement_Raw.xlsx',
      mimeType: mime,
      buffer,
    }));
  } catch (persistErr) {
    // MinIO fail sau ensureDraft → nháp trống «— —»; xóa orphan để UI không lệch.
    await deleteOrphanEmptyDraft(draft);
    throw persistErr;
  }

  const doc = await CustomerDocument.create({
    organizationId: project.organizationId,
    projectId,
    filename: String(fileName || 'Customer_Requirement_Raw.xlsx').slice(0, 260),
    mimeType: mime,
    storageKey,
    sizeBytes: sizeBytes != null ? Number(sizeBytes) : storedSize,
    contentHash,
    docClass: 'customer_raw',
    notes: 'import-set:raw',
    importSetId: draft._id,
    uploadedBy: userId,
    isActive: true,
  });

  draft.rawDocumentId = doc._id;
  draft.updatedBy = userId;
  await draft.save();

  return enrichSet(draft.toObject());
}

/** Draft không có Raw/Analysis — thường do upload MinIO fail giữa chừng. */
async function deleteOrphanEmptyDraft(draft) {
  if (!draft?._id) return;
  const hasRaw = Boolean(draft.rawDocumentId);
  const hasAnalysis = Boolean(draft.analysisDocumentId);
  if (hasRaw || hasAnalysis) return;
  if (String(draft.status || '') !== 'draft') return;
  try {
    await AnalysisImportSet.deleteOne({ _id: draft._id, status: 'draft' });
  } catch {
    /* non-blocking */
  }
}

async function purgeOrphanEmptyDrafts(projectId) {
  const orphans = await AnalysisImportSet.find({
    projectId,
    status: 'draft',
    $and: [
      { $or: [{ rawDocumentId: null }, { rawDocumentId: { $exists: false } }] },
      { $or: [{ analysisDocumentId: null }, { analysisDocumentId: { $exists: false } }] },
    ],
  })
    .select('_id')
    .lean();
  if (!orphans.length) return 0;
  const ids = orphans.map((o) => o._id);
  await AnalysisImportSet.deleteMany({ _id: { $in: ids }, status: 'draft' });
  return ids.length;
}

async function softDeleteImportSet({ userId, projectId, setId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:document_upload',
  });
  const setDoc = await AnalysisImportSet.findOne({ _id: setId, projectId });
  if (!setDoc) {
    const err = new Error('Import Set không tồn tại');
    err.statusCode = 404;
    err.errorCode = IMPORT_SET_ERROR_CODES.NOT_FOUND;
    throw err;
  }
  if (setDoc.status === 'trashed') {
    return enrichSet(setDoc.toObject());
  }
  const now = new Date();
  await markSetTrashed(setDoc, userId, now);
  return enrichSet(setDoc.toObject());
}

async function getImportSetDiff({ userId, projectId, setId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({ userId, projectId, permission: 'analysis:artifact_import' });
  const target = await AnalysisImportSet.findOne({ _id: setId, projectId, status: 'trashed' });
  if (!target) {
    const err = new Error('Import Set không ở thùng rác');
    err.statusCode = 404;
    err.errorCode = IMPORT_SET_ERROR_CODES.NOT_TRASHED;
    throw err;
  }
  const currentActive = await findActiveSet(projectId);
  const activeArts = currentActive
    ? await AnalysisArtifact.find({
        projectId,
        importSetId: currentActive._id,
        isActive: true,
      })
        .select('kind externalKey source contentHash structured')
        .lean()
    : [];
  const mapped = activeArts.map((a) => ({
    id: String(a._id),
    kind: a.kind,
    externalKey: a.externalKey,
    source: a.source,
    contentHash: a.contentHash,
    seedContentHash: a.structured?.seedContentHash || '',
  }));
  const { manualEditedArtifacts, truncated } = pickManualEditedForDiff(mapped);
  return {
    willActivate: {
      id: String(target._id),
      status: target.status,
      rawDocumentId: target.rawDocumentId ? String(target.rawDocumentId) : null,
      analysisDocumentId: target.analysisDocumentId ? String(target.analysisDocumentId) : null,
      packId: target.packId ? String(target.packId) : null,
    },
    willTrash: currentActive
      ? {
          id: String(currentActive._id),
          status: currentActive.status,
        }
      : null,
    manualEditedArtifacts,
    truncated,
  };
}

async function restoreImportSet({ userId, projectId, setId }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({
    userId,
    projectId,
    permission: 'analysis:artifact_import',
  });
  const setDoc = await AnalysisImportSet.findOne({ _id: setId, projectId });
  if (!setDoc) {
    const err = new Error('Import Set không tồn tại');
    err.statusCode = 404;
    err.errorCode = IMPORT_SET_ERROR_CODES.NOT_FOUND;
    throw err;
  }
  assertCanRestore(setDoc);

  const currentActive = await findActiveSet(projectId);
  const { activateId, trashIds } = planRestoreSwap({
    restoreSetId: String(setDoc._id),
    currentActiveSetId: currentActive ? String(currentActive._id) : null,
  });

  const now = new Date();
  let revertedFrom = null;
  for (const tid of trashIds) {
    const other = await AnalysisImportSet.findOne({ _id: tid, projectId });
    if (other && other.status === 'active') {
      revertedFrom = other._id;
      await markSetTrashed(other, userId, now);
    }
  }

  if (String(setDoc._id) !== activateId) {
    const err = new Error('Restore swap mismatch');
    err.statusCode = 500;
    throw err;
  }
  await markSetActive(setDoc, userId, { revertedFromSetId: revertedFrom });
  return enrichSet(setDoc.toObject());
}

/**
 * Stage set after confirm — pending_review, no artifact seed (gate enabled).
 */
async function stageImportSetOnConfirm({
  userId,
  projectId,
  importSetId,
  analysisDocumentId,
  packId,
}) {
  const setDoc = await AnalysisImportSet.findOne({ _id: importSetId, projectId });
  if (!setDoc) {
    const err = new Error('Import Set không tồn tại');
    err.statusCode = 404;
    err.errorCode = IMPORT_SET_ERROR_CODES.NOT_FOUND;
    throw err;
  }
  if (String(setDoc.status || '') !== 'draft') {
    const err = new Error('Chỉ stage Import Set đang draft');
    err.statusCode = 409;
    err.errorCode = IMPORT_SET_ERROR_CODES.TRANSITION_DENIED;
    throw err;
  }
  if (
    setDoc.analysisDocumentId &&
    String(setDoc.analysisDocumentId) !== String(analysisDocumentId)
  ) {
    assertCanAttachAnalysis(setDoc);
  }

  setDoc.analysisDocumentId = analysisDocumentId;
  setDoc.packId = packId;
  setDoc.status = 'pending_review';
  setDoc.review = { ba: {}, tech: {}, po: {} };
  setDoc.updatedBy = userId;
  await setDoc.save();

  await assertTechReviewerExists(projectId);

  await appendImportSetAudit({
    organizationId: setDoc.organizationId,
    actorUserId: userId,
    action: 'import_set_stage',
    setId: setDoc._id,
    meta: { packId: String(packId) },
  });

  return setDoc;
}

async function publishImportSet({ userId, projectId, setId, techRequired }) {
  const setDoc = await AnalysisImportSet.findOne({ _id: setId, projectId });
  if (!setDoc) {
    const err = new Error('Import Set không tồn tại');
    err.statusCode = 404;
    err.errorCode = IMPORT_SET_ERROR_CODES.NOT_FOUND;
    throw err;
  }
  if (setDoc.status === 'active') {
    return setDoc;
  }
  let needTech = techRequired;
  if (needTech == null) {
    const { projectHasAnalysisTechReviewer } = require('../utils/phase1GatePolicy');
    needTech = await projectHasAnalysisTechReviewer(projectId);
  }
  assertCanPublish(setDoc, { techRequired: needTech });
  assertCanActivate(setDoc);

  const pack = await RequirementPack.findById(setDoc.packId);
  if (!pack) {
    const err = new Error('RequirementPack không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const analysisService = require('./analysis.service');
  await analysisService.seedArtifactsFromRequirementPack({
    userId,
    projectId,
    pack: pack.toObject ? pack.toObject() : pack,
    importSetId: setDoc._id,
    sourceDocumentId: setDoc.analysisDocumentId,
  });

  const currentActive = await findActiveSet(projectId);
  const { trashIds } = planActivateSwap({
    activatingSetId: String(setDoc._id),
    currentActiveSetId: currentActive ? String(currentActive._id) : null,
  });
  const now = new Date();
  for (const tid of trashIds) {
    const other = await AnalysisImportSet.findOne({ _id: tid, projectId });
    if (other && other.status === 'active') {
      await markSetTrashed(other, userId, now);
    }
  }

  await markSetActive(setDoc, userId);

  await appendImportSetAudit({
    organizationId: setDoc.organizationId,
    actorUserId: userId,
    action: 'import_set_publish',
    setId: setDoc._id,
    meta: { packId: String(setDoc.packId) },
  });

  return setDoc;
}

async function transitionImportSet({ userId, projectId, setId, toStatus, note = '' }) {
  await assertProjectMemberAccess({ userId, projectId });
  const setDoc = await AnalysisImportSet.findOne({ _id: setId, projectId });
  if (!setDoc) {
    const err = new Error('Import Set không tồn tại');
    err.statusCode = 404;
    err.errorCode = IMPORT_SET_ERROR_CODES.NOT_FOUND;
    throw err;
  }

  const {
    projectHasAnalysisTechReviewer,
    assertGateStampSoD,
    notifyNextGateReviewers,
  } = require('../utils/phase1GatePolicy');
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const techRequired = await projectHasAnalysisTechReviewer(projectId);
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;

  const { to, permission, publish, republish } = planSetTransition(setDoc, toStatus, {
    techRequired,
  });
  if (permission) {
    await assertAnalysisPerm({ userId, projectId, permission });
  }

  const review = setDoc.review || {};
  if (to === 'tech_review') {
    assertGateStampSoD({ actorUserId: userId, priorStamps: [], bypass });
  } else if (to === 'po_review') {
    assertGateStampSoD({ actorUserId: userId, priorStamps: [review.ba], bypass });
  } else if (to === 'approved' && !republish) {
    assertGateStampSoD({
      actorUserId: userId,
      priorStamps: [review.ba, review.tech],
      bypass,
    });
  }

  const gateNote = String(note || '').trim().slice(0, 1000);
  if (to === 'rejected' && !gateNote) {
    const err = new Error('Bắt buộc ghi lý do khi từ chối Import Set');
    err.statusCode = 400;
    err.errorCode = 'IMPORT_SET_NOTE_REQUIRED';
    throw err;
  }
  const stamp = { userId, at: new Date(), note: gateNote };

  if (to === 'rejected') {
    setDoc.status = 'rejected';
    setDoc.updatedBy = userId;
    await setDoc.save();
    await appendImportSetAudit({
      organizationId: setDoc.organizationId,
      actorUserId: userId,
      action: 'import_set_reject',
      setId: setDoc._id,
      meta: { note: gateNote },
    });
    return enrichSet(setDoc.toObject());
  }

  if (to === 'tech_review') {
    setDoc.review.ba = stamp;
    if (!techRequired) {
      setDoc.review.tech = { skipped: true, at: new Date(), note: 'tech_optional_skip' };
    }
  } else if (to === 'po_review') {
    setDoc.review.tech = stamp;
  } else if (to === 'approved') {
    if (!republish) {
      setDoc.review.po = stamp;
      setDoc.updatedBy = userId;
      await setDoc.save();
    }
    if (publish) {
      const published = await publishImportSet({
        userId,
        projectId,
        setId: setDoc._id,
        techRequired,
      });
      return enrichSet(published.toObject());
    }
  }
  setDoc.updatedBy = userId;
  await setDoc.save();

  // Dual-gate: BA stamp Import Set → mở hàng chờ artifact cho Tech (hoặc PO nếu skip Tech).
  if (to === 'tech_review') {
    try {
      const synced = await syncArtifactReviewQueueFromSetGate(setDoc, {
        techRequired,
        actorUserId: userId,
      });
      if (synced?.modifiedCount) {
        logger.info(
          `[ImportSet] BA gate promoted ${synced.modifiedCount} artifacts → ${synced.queueTo} (set=${setDoc._id})`
        );
      }
    } catch (promoErr) {
      logger.warn('[ImportSet] artifact queue promote after BA gate failed', {
        setId: String(setDoc._id),
        err: promoErr?.message,
      });
    }
  }

  let nextPermission = null;
  if (to === 'tech_review') {
    nextPermission = techRequired ? 'analysis:tech_review' : 'analysis:po_review';
  } else if (to === 'po_review') {
    nextPermission = 'analysis:po_review';
  }
  if (nextPermission) {
    await notifyNextGateReviewers({
      projectId,
      organizationId: setDoc.organizationId,
      actorUserId: userId,
      nextPermission,
      title: 'Import Set chờ duyệt',
      content: 'Có Import Set cần bạn duyệt ở cổng tiếp theo.',
      kind: 'import_set_gate_pending',
      actionPath: 'customer-documents',
    });
  }

  return enrichSet(setDoc.toObject());
}

/**
 * After pack+analysis doc ready: activate draft set and trash previous ACTIVE (legacy path).
 */
async function activateImportSetOnConfirm({
  userId,
  projectId,
  importSetId,
  analysisDocumentId,
  packId,
}) {
  const setDoc = await AnalysisImportSet.findOne({ _id: importSetId, projectId });
  if (!setDoc) {
    const err = new Error('Import Set không tồn tại');
    err.statusCode = 404;
    err.errorCode = IMPORT_SET_ERROR_CODES.NOT_FOUND;
    throw err;
  }
  if (
    setDoc.analysisDocumentId &&
    String(setDoc.analysisDocumentId) !== String(analysisDocumentId)
  ) {
    assertCanAttachAnalysis(setDoc);
  }

  setDoc.analysisDocumentId = analysisDocumentId;
  setDoc.packId = packId;
  setDoc.updatedBy = userId;
  await setDoc.save();

  assertCanActivate(setDoc);

  const currentActive = await findActiveSet(projectId);
  const { trashIds } = planActivateSwap({
    activatingSetId: String(setDoc._id),
    currentActiveSetId: currentActive ? String(currentActive._id) : null,
  });

  const now = new Date();
  for (const tid of trashIds) {
    const other = await AnalysisImportSet.findOne({ _id: tid, projectId });
    if (other && other.status === 'active') {
      await markSetTrashed(other, userId, now);
    }
  }

  await markSetActive(setDoc, userId);
  return setDoc;
}

module.exports = {
  listImportSets,
  ensureDraftImportSet,
  attachRawDocument,
  softDeleteImportSet,
  restoreImportSet,
  getImportSetDiff,
  transitionImportSet,
  publishImportSet,
  stageImportSetOnConfirm,
  activateImportSetOnConfirm,
  persistImportSetFileBuffer,
  findActiveSet,
  cascadeTrashMembers,
  cascadeRestoreMembers,
  serializeSet,
  enrichSet,
  assertTechReviewerExists,
};
