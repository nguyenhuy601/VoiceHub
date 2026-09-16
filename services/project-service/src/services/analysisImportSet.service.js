const { logger } = require('@enterprise/shared');
const Project = require('../models/Project');
const AnalysisImportSet = require('../models/AnalysisImportSet');
const CustomerDocument = require('../models/CustomerDocument');
const AnalysisArtifact = require('../models/AnalysisArtifact');
const RequirementPack = require('../models/RequirementPack');
const ArtifactTraceLink = require('../models/ArtifactTraceLink');
const {
  isProjectRbacV2Enabled,
} = require('../utils/project/projectPermissionMatrix');
const { assertUserProjectPermission } = require('./projectAccess.service');
const {
  assertCanAttachRaw,
  assertCanAttachAnalysis,
  assertCanActivate,
  assertCanRestore,
  planActivateSwap,
  planRestoreSwap,
  IMPORT_SET_ERROR_CODES,
} = require('../constants/analysisImportSet');
const { CUSTOMER_RAW_TEMPLATE_TYPE } = require('../constants/customerRawTemplate.constants');
const {
  peekWorkbookTemplateType,
} = require('../utils/requirement/requirementAnalysisTemplateParse');

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

function serializeSet(doc, extras = {}) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
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
    // Race: another request created draft
    if (err && (err.code === 11000 || String(err.message || '').includes('duplicate'))) {
      draft = await AnalysisImportSet.findOne({ projectId, status: 'draft' });
      if (draft) return draft;
    }
    throw err;
  }
  return draft;
}

/**
 * Cascade soft-delete all members of an Import Set (RULE-03).
 */
async function cascadeTrashMembers({ importSetId, userId, now }) {
  const setId = importSetId;
  await CustomerDocument.updateMany(
    { importSetId: setId, isActive: true },
    {
      $set: {
        isActive: false,
        deletedAt: now,
        deletedBy: userId,
      },
    }
  );
  await RequirementPack.updateMany(
    { importSetId: setId, isActive: true },
    {
      $set: {
        isActive: false,
        deletedAt: now,
        deletedBy: userId,
      },
    }
  );
  const arts = await AnalysisArtifact.find({ importSetId: setId, isActive: true })
    .select('_id')
    .lean();
  const artIds = arts.map((a) => a._id);
  if (artIds.length) {
    await AnalysisArtifact.updateMany(
      { _id: { $in: artIds } },
      { $set: { isActive: false, updatedBy: userId } }
    );
    await ArtifactTraceLink.updateMany(
      {
        isActive: true,
        $or: [{ fromArtifactId: { $in: artIds } }, { toArtifactId: { $in: artIds } }],
      },
      { $set: { isActive: false } }
    );
  }
}

/**
 * Cascade restore members when bringing a set back to active (RULE-04).
 */
async function cascadeRestoreMembers({ importSetId, userId }) {
  const setId = importSetId;
  await CustomerDocument.updateMany(
    { importSetId: setId },
    {
      $set: {
        isActive: true,
        deletedAt: null,
        deletedBy: null,
      },
    }
  );
  await RequirementPack.updateMany(
    { importSetId: setId },
    {
      $set: {
        isActive: true,
        deletedAt: null,
        deletedBy: null,
      },
    }
  );
  const arts = await AnalysisArtifact.find({ importSetId: setId })
    .select('_id')
    .lean();
  const artIds = arts.map((a) => a._id);
  if (artIds.length) {
    await AnalysisArtifact.updateMany(
      { _id: { $in: artIds } },
      { $set: { isActive: true, updatedBy: userId } }
    );
    await ArtifactTraceLink.updateMany(
      {
        $or: [{ fromArtifactId: { $in: artIds } }, { toArtifactId: { $in: artIds } }],
      },
      { $set: { isActive: true } }
    );
  }
}

async function markSetTrashed(setDoc, userId, now) {
  setDoc.status = 'trashed';
  setDoc.trashedAt = now;
  setDoc.deletedAt = now;
  setDoc.deletedBy = userId;
  setDoc.updatedBy = userId;
  await setDoc.save();
  await cascadeTrashMembers({ importSetId: setDoc._id, userId, now });
  logger.info(
    `analysisImportSet trashed set=${setDoc._id} project=${setDoc.projectId} by=${userId}`
  );
}

async function markSetActive(setDoc, userId) {
  setDoc.status = 'active';
  setDoc.trashedAt = null;
  setDoc.deletedAt = null;
  setDoc.deletedBy = null;
  setDoc.updatedBy = userId;
  await setDoc.save();
  await cascadeRestoreMembers({ importSetId: setDoc._id, userId });
  logger.info(
    `analysisImportSet activated set=${setDoc._id} project=${setDoc.projectId} by=${userId}`
  );
}

async function listImportSets({ userId, projectId, status }) {
  await assertProjectMemberAccess({ userId, projectId });
  await assertAnalysisPerm({ userId, projectId, permission: 'analysis:view' });
  const filter = { projectId };
  const st = String(status || '').trim().toLowerCase();
  if (st && ['draft', 'active', 'trashed'].includes(st)) {
    filter.status = st;
  }
  const rows = await AnalysisImportSet.find(filter).sort({ updatedAt: -1 }).lean();
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

  const doc = await CustomerDocument.create({
    organizationId: project.organizationId,
    projectId,
    filename: String(fileName || 'Customer_Requirement_Raw.xlsx').slice(0, 260),
    mimeType:
      String(mimeType || '').trim().slice(0, 120) ||
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    storageKey: `pending/${projectId}/${Date.now()}-raw`.slice(0, 512),
    sizeBytes: sizeBytes != null ? Number(sizeBytes) : buffer.length,
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

/**
 * Soft-delete Import Set (active or draft). Cascades members.
 */
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

/**
 * Restore trashed Import Set → ACTIVE; current ACTIVE → trash (RULE-04).
 */
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
  for (const tid of trashIds) {
    const other = await AnalysisImportSet.findOne({ _id: tid, projectId });
    if (other && other.status === 'active') {
      await markSetTrashed(other, userId, now);
    }
  }

  if (String(setDoc._id) !== activateId) {
    const err = new Error('Restore swap mismatch');
    err.statusCode = 500;
    throw err;
  }
  await markSetActive(setDoc, userId);
  return enrichSet(setDoc.toObject());
}

/**
 * After pack+analysis doc ready: activate draft set and trash previous ACTIVE.
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
  activateImportSetOnConfirm,
  findActiveSet,
  cascadeTrashMembers,
  cascadeRestoreMembers,
  serializeSet,
  enrichSet,
};
