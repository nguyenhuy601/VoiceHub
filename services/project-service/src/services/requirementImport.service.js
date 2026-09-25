const { logger } = require('@enterprise/shared');
const RequirementImportSession = require('../models/RequirementImportSession');
const RequirementPack = require('../models/RequirementPack');
const { IMPORT_SESSION_TTL_HOURS, TEMPLATE_VERSION } = require('../constants/requirementTemplate.constants');
const { parseRequirementWorkbook } = require('../utils/requirement/requirementTemplateParse');
const { validateRequirementWorkbook } = require('../utils/requirement/requirementTemplateValidate');
const {
  buildExcelPreviewFromBuffer,
  buildRequirementSourceStoragePath,
  XLSX_MIME,
} = require('../utils/requirement/requirementExcelPreview');
const { buildSyntheticExcelPreviewFromPack } = require('../utils/requirement/requirementPackPreviewFallback');
const objectStorage = require('../utils/common/objectStorage');
const {
  assertRequirementPermission,
  assertRequirementImportOrCreateProjectScope,
} = require('./requirementAccess.service');
const {
  pickPlanningReadinessSummary,
  assertPreviewReadyForImport,
} = require('../utils/requirement/requirementPlanningReadiness');
const { mapParsedToPackPayload } = require('../utils/requirement/mapParsedToPackPayload');

async function previewCustomerRawIntake({ userId, organizationId, buffer, fileName }) {
  const {
    parseCustomerRawContext,
    isCustomerRawTemplateType,
  } = require('../utils/requirement/customerRawContextParse');
  const {
    mapCustomerRawToProjectIntakeDraft,
  } = require('../utils/requirement/mapCustomerRawToProjectIntakeDraft');
  const { CUSTOMER_RAW_TEMPLATE_TYPE } = require('../constants/customerRawTemplate.constants');

  let parsed;
  try {
    parsed = parseCustomerRawContext(buffer);
  } catch (err) {
    logger.warn('[requirementImport] CustomerRaw parse failed', {
      message: err?.message,
      fileName: String(fileName || '').slice(0, 255),
    });
    const parseErr = new Error('Không đọc được Customer Requirement Raw');
    parseErr.statusCode = 400;
    parseErr.errorCode = 'REQ_IMPORT_CUSTOMER_RAW_PARSE_FAILED';
    throw parseErr;
  }

  if (!isCustomerRawTemplateType(parsed.templateType) && !parsed.isCustomerRaw) {
    const typeErr = new Error('File không phải Customer Requirement Raw');
    typeErr.statusCode = 400;
    typeErr.errorCode = 'REQ_IMPORT_NOT_CUSTOMER_RAW';
    throw typeErr;
  }

  const issues = [];
  if (!parsed.contextSheetPresent) {
    issues.push({
      severity: 'error',
      code: 'CUSTOMER_RAW_CONTEXT_MISSING',
      message: 'Thiếu sheet 01_Project_Context',
    });
    logger.warn('[requirementImport] CustomerRaw missing context sheet', {
      fileName: String(fileName || '').slice(0, 255),
    });
  }

  const projectIntakeDraft = mapCustomerRawToProjectIntakeDraft(parsed);
  const valid = parsed.contextSheetPresent;
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const summary = {
    contextValueCount: parsed.contextValueCount,
    hasTitle: Boolean(projectIntakeDraft.title),
  };

  const excelPreview = buildExcelPreviewFromBuffer(buffer, {
    fileName: String(fileName || '').slice(0, 255),
    functionalRequirements: [],
  });

  const expiresAt = new Date(Date.now() + IMPORT_SESSION_TTL_HOURS * 60 * 60 * 1000);
  const session = await RequirementImportSession.create({
    organizationId,
    uploadedBy: userId,
    fileName: String(fileName || '').slice(0, 255),
    templateVersion: parsed.templateVersion || '',
    status: 'preview',
    expiresAt,
    errorCount,
    warningCount: 0,
    issues,
    summary,
    previewPayload: null,
    previewTree: null,
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
    templateType: CUSTOMER_RAW_TEMPLATE_TYPE,
    valid,
    canRunAiAnalysis: false,
    errorCount,
    warningCount: 0,
    infoCount: 0,
    issues,
    summary,
    previewTree: null,
    excelPreview,
    expiresAt: session.expiresAt,
    newSkillsDetected: [],
    newSkillsCount: 0,
    skillResolveEnabled: false,
    planningReadiness: null,
    projectIntakeDraft,
  };
}

async function previewRequirementImport({ userId, organizationId, fileBuffer, fileName }) {
  const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer || []);
  const {
    peekWorkbookTemplateType,
    isAnalysisTemplateType,
    parseAnalysisWorkbook,
  } = require('../utils/requirement/requirementAnalysisTemplateParse');
  const { validateAnalysisWorkbook } = require('../utils/requirement/requirementAnalysisTemplateValidate');
  const {
    isCustomerRawTemplateType,
    peekCustomerRawTemplateType,
  } = require('../utils/requirement/customerRawContextParse');

  // Peek before authz: Customer Raw uses create-project OR import; Analysis/SRS stay import-only.
  // Prefer Customer Raw peek (Meta aliases + sheet fingerprint) — analysis peek alone misses filled Raw files.
  const peekedType =
    peekCustomerRawTemplateType(buffer) || peekWorkbookTemplateType(buffer);
  if (isCustomerRawTemplateType(peekedType)) {
    await assertRequirementImportOrCreateProjectScope({ userId, organizationId });
    return previewCustomerRawIntake({ userId, organizationId, buffer, fileName });
  }

  await assertRequirementPermission({ userId, organizationId, permission: 'requirement:import' });

  const useAnalysis = isAnalysisTemplateType(peekedType);

  let parsed;
  let validation;
  if (useAnalysis) {
    parsed = parseAnalysisWorkbook(buffer);
    validation = validateAnalysisWorkbook({
      fileName,
      fileSize: buffer.length || 0,
      parsed,
    });
  } else {
    parsed = parseRequirementWorkbook(buffer);
    validation = validateRequirementWorkbook({
      fileName,
      fileSize: buffer.length || 0,
      parsed,
    });
  }

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
    previewPayload: previewPayload,
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
    templateType: useAnalysis ? 'RequirementAnalysis' : 'SRS',
    valid: validation.valid,
    canRunAiAnalysis: useAnalysis ? false : Boolean(validation.canRunAiAnalysis),
    errorCount: validation.errorCount,
    warningCount: validation.warningCount,
    infoCount: validation.infoCount || 0,
    issues: validation.issues,
    summary: validation.summary,
    previewTree: validation.previewTree,
    excelPreview,
    expiresAt: session.expiresAt,
    newSkillsDetected: [],
    newSkillsCount: 0,
    skillResolveEnabled: false,
    planningReadiness: previewPayload ? pickPlanningReadinessSummary(previewPayload) : null,
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
  assertPreviewReadyForImport(payload);

  const packSeed = {
    organizationId,
    createdBy: userId,
    status: 'draft',
    importSessionId: session._id,
    sourceFileName: session.fileName,
    previewTree: session.previewTree || null,
    importIssues: session.issues || [],
    ...payload,
  };
  packSeed.excelPreview = buildSyntheticExcelPreviewFromPack(packSeed);
  packSeed.planningReadiness = pickPlanningReadinessSummary(packSeed);

  const pack = await RequirementPack.create(packSeed);

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
      // Best-effort: pack vẫn tạo được để Create Project / Hub seed không bị chặn bởi MinIO lệch key.
      logger.error(
        `requirementImport MinIO putObject failed pack=${pack._id}: ${uploadErr.message} — continuing without sourceFileId`
      );
      logger.warn(
        `requirementImport storage soft-fail pack=${pack._id} — source xlsx not persisted`
      );
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
