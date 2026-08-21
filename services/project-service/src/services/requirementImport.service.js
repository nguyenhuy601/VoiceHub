const { logger } = require('@enterprise/shared');
const RequirementImportSession = require('../models/RequirementImportSession');
const RequirementPack = require('../models/RequirementPack');
const { IMPORT_SESSION_TTL_HOURS, TEMPLATE_VERSION } = require('../constants/requirementTemplate.constants');
const { parseRequirementWorkbook } = require('../utils/requirementTemplateParse');
const { validateRequirementWorkbook } = require('../utils/requirementTemplateValidate');
const { parseDateValue } = require('../utils/requirementDateUtils');
const {
  buildStaffingPlanFromParsed,
} = require('../utils/requirementStaffingRollup');
const { resolveWhitelistSkill } = require('../utils/requirementStaffingParse');
const {
  buildExcelPreviewFromBuffer,
  buildRequirementSourceStoragePath,
  XLSX_MIME,
} = require('../utils/requirementExcelPreview');
const objectStorage = require('../utils/objectStorage');
const { assertRequirementPermission } = require('./requirementAccess.service');

function splitPlatforms(raw) {
  return String(raw || '')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapFunctionalRow(row) {
  return {
    externalId: row.externalId,
    level: row.level,
    parentExternalId: row.parentExternalId || '',
    name: row.name,
    description: row.description || '',
    priority: row.priority || 'Medium',
    acceptanceCriteria: row.acceptanceCriteria || '',
    sortOrder: row.sortOrder ?? 0,
    suggestedSkills: (row.suggestedSkills || []).map((s) => resolveWhitelistSkill(s)).filter(Boolean),
    estimateHours: row.estimateHours ?? null,
    suggestedRoleKey: row.suggestedRoleKey || '',
  };
}

function mapParsedToPackPayload(parsed) {
  const overview = parsed.overview || {};
  const functionalRequirements = (parsed.functionalRequirements || []).map(mapFunctionalRow);
  const staffingPlan = buildStaffingPlanFromParsed({
    ...parsed,
    functionalRequirements,
  });

  return {
    templateVersion: parsed.templateVersion || TEMPLATE_VERSION,
    overview: {
      requirementName: overview.requirementName || '',
      projectObjective: overview.projectObjective || '',
      businessScope: overview.businessScope || '',
      platform: splitPlatforms(overview.platform),
      expectedUsers: overview.expectedUsers || '',
      expectedScale: overview.expectedScale || '',
      deadline: parseDateValue(overview.deadline),
      startDate: parseDateValue(overview.startDate),
      budget: overview.budget ? Number(String(overview.budget).replace(/[^\d.-]/g, '')) || null : null,
      budgetCurrency: String(overview.budgetCurrency || staffingPlan.budgetCurrency || '').trim().toUpperCase(),
      priority: overview.priority || 'Medium',
    },
    staffingPlan,
    aiPlanning: {
      status: 'none',
      overlay: null,
      generatedAt: null,
      sourcePackVersion: null,
    },
    scope: (parsed.scope || []).map((row) => ({
      type: row.type,
      description: row.description,
    })),
    functionalRequirements,
    nonFunctionalRequirements: (parsed.nonFunctionalRequirements || []).map((row) => ({
      externalId: row.externalId,
      category: row.category,
      requirement: row.requirement,
      target: row.target,
      priority: row.priority || 'Medium',
    })),
    technology: (parsed.technology || []).map((row) => ({
      category: row.category,
      name: row.name,
      version: row.version,
      mandatory: Boolean(row.mandatory),
      note: row.note || '',
    })),
    integration: (parsed.integration || []).map((row) => ({
      system: row.system,
      integrationType: row.integrationType,
      direction: row.direction,
      description: row.description,
      required: row.required !== false,
    })),
    constraints: (parsed.constraints || []).map((row) => ({
      type: row.type,
      description: row.description,
    })),
    dependencies: (parsed.dependencies || []).map((row) => ({
      externalId: row.externalId,
      dependency: row.dependency,
      type: row.type,
      requiredDate: parseDateValue(row.requiredDateRaw),
      impact: row.impact,
    })),
    assumptions: (parsed.assumptions || []).map((row) => ({
      externalId: row.externalId,
      assumption: row.assumption,
      impactIfInvalid: row.impactIfInvalid,
    })),
  };
}

async function previewRequirementImport({ userId, organizationId, fileBuffer, fileName }) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:import' });

  const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer || []);
  const parsed = parseRequirementWorkbook(buffer);
  const validation = validateRequirementWorkbook({
    fileName,
    fileSize: buffer.length || 0,
    parsed,
  });

  const excelPreview = buildExcelPreviewFromBuffer(buffer, {
    fileName: String(fileName || '').slice(0, 255),
  });

  const expiresAt = new Date(Date.now() + IMPORT_SESSION_TTL_HOURS * 60 * 60 * 1000);
  const session = await RequirementImportSession.create({
    organizationId,
    uploadedBy: userId,
    fileName: String(fileName || '').slice(0, 255),
    templateVersion: parsed.templateVersion || TEMPLATE_VERSION,
    status: 'preview',
    expiresAt,
    errorCount: validation.errorCount,
    warningCount: validation.warningCount,
    issues: validation.issues,
    summary: validation.summary,
    previewPayload: validation.valid ? mapParsedToPackPayload(parsed) : null,
    previewTree: validation.previewTree,
    excelPreview,
    fileBuffer: buffer.length <= 5 * 1024 * 1024 ? buffer : undefined,
    fileContentType: XLSX_MIME,
  });

  return {
    sessionId: String(session._id),
    fileName: session.fileName,
    templateVersion: session.templateVersion,
    valid: validation.valid,
    errorCount: validation.errorCount,
    warningCount: validation.warningCount,
    issues: validation.issues,
    summary: validation.summary,
    previewTree: validation.previewTree,
    excelPreview,
    expiresAt: session.expiresAt,
  };
}

async function confirmRequirementImport({ userId, organizationId, sessionId }) {
  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:import' });

  const session = await RequirementImportSession.findOne({
    _id: sessionId,
    organizationId,
    status: 'preview',
  });
  if (!session) {
    const err = new Error('Import session không tồn tại hoặc đã hết hạn');
    err.statusCode = 404;
    throw err;
  }
  if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
    session.status = 'expired';
    session.fileBuffer = undefined;
    await session.save();
    const err = new Error('Import session đã hết hạn');
    err.statusCode = 410;
    throw err;
  }
  if (session.errorCount > 0 || !session.previewPayload) {
    const err = new Error('Không thể import — file còn lỗi validation');
    err.statusCode = 400;
    err.errorCode = 'REQ_IMPORT_HAS_ERRORS';
    throw err;
  }

  const payload = session.previewPayload;
  const pack = await RequirementPack.create({
    organizationId,
    createdBy: userId,
    status: 'draft',
    importSessionId: session._id,
    sourceFileName: session.fileName,
    excelPreview: session.excelPreview || null,
    previewTree: session.previewTree || null,
    importIssues: session.issues || [],
    ...payload,
  });

  let sourceFileId = '';
  const stashBuffer = session.fileBuffer;
  if (objectStorage.isEnabled()) {
    if (!stashBuffer || !Buffer.isBuffer(stashBuffer) || stashBuffer.length === 0) {
      await RequirementPack.deleteOne({ _id: pack._id });
      const err = new Error('Thiếu file gốc trên session — preview lại rồi confirm');
      err.statusCode = 400;
      err.errorCode = 'REQ_IMPORT_SOURCE_MISSING';
      throw err;
    }
    const storagePath = buildRequirementSourceStoragePath(organizationId, pack._id);
    try {
      await objectStorage.putObject(
        storagePath,
        stashBuffer,
        session.fileContentType || XLSX_MIME
      );
      sourceFileId = storagePath;
      pack.sourceFileId = sourceFileId;
      await pack.save();
    } catch (uploadErr) {
      await RequirementPack.deleteOne({ _id: pack._id });
      logger.error(
        `requirementImport MinIO putObject failed pack=${pack._id}: ${uploadErr.message}`
      );
      const err = new Error('Không lưu được file gốc lên object storage — thử lại sau');
      err.statusCode = 503;
      err.errorCode = 'REQ_IMPORT_STORAGE_FAILED';
      throw err;
    }
  } else {
    logger.warn(
      `requirementImport MinIO disabled — pack=${pack._id} created without sourceFileId`
    );
  }

  session.status = 'imported';
  session.requirementPackId = pack._id;
  session.fileBuffer = undefined;
  await session.save();

  return pack.toObject();
}

module.exports = {
  previewRequirementImport,
  confirmRequirementImport,
  mapParsedToPackPayload,
};
