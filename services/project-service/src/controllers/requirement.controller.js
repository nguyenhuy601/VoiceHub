const {
  TEMPLATE_FILE_NAME,
} = require('../constants/requirementTemplate.constants');
const { buildRequirementTemplateBuffer } = require('../utils/requirement/requirementTemplateBuilder');
const {
  previewRequirementImport,
  confirmRequirementImport,
} = require('../services/requirementImport.service');
const {
  listRequirementPacks,
  getRequirementPack,
  getRequirementPackSourceFile,
  submitRequirementPack,
  approveRequirementPack,
  rejectRequirementPack,
  createProjectFromRequirementPack,
  deleteRequirementPack,
  createIntakeDraftPack,
} = require('../services/requirementPack.service');
const analysisService = require('../services/analysis.service');
const {
  getAiAnalysisSummary,
  getAiAnalysisWizardJob,
  runAiAnalysisJob,
  confirmAiAnalysisJob,
  exportAiAnalysisSheet11,
  startPhaseAiPlanningRun,
} = require('../services/aiAnalysis.service');
const {
  createOrReuseAiAnalysisSnapshot,
  getActiveAiAnalysisSnapshotMeta,
} = require('../services/aiAnalysisSnapshot.service');
const {
  getAiAnalysisSummary,
  getAiAnalysisWizardJob,
  runAiAnalysisJob,
  confirmAiAnalysisJob,
  exportAiAnalysisSheet11,
} = require('../services/aiAnalysis.service');
const {
  assertRequirementPermission,
  resolveRequirementAccess,
} = require('../services/requirementAccess.service');

function resolveOrgId(req) {
  return String(
    req.headers['x-organization-id'] ||
      req.query?.organizationId ||
      req.body?.organizationId ||
      ''
  ).trim();
}

function resolveUserId(req) {
  return String(req.user?.id || req.user?.userId || req.user?._id || '').trim();
}

function jsonError(res, err) {
  const body = {
    success: false,
    message: err.message || 'Error',
    errorCode: err.errorCode || 'REQUIREMENT_ERROR',
  };
  if (err.details) body.data = err.details;
  return res.status(err.statusCode || 500).json(body);
}

async function downloadTemplate(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId bắt buộc' });
    }
    await assertRequirementPermission({ userId, organizationId, permission: 'requirement:view' });

    const variant = String(req.query?.variant || '')
      .trim()
      .toLowerCase();

    if (variant === 'raw') {
      const {
        loadCustomerRawTemplateBuffer,
        CUSTOMER_RAW_FILE_NAME,
      } = require('../utils/requirement/customerRawTemplateBuilder');
      const buf = await loadCustomerRawTemplateBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${CUSTOMER_RAW_FILE_NAME}"`);
      return res.send(Buffer.from(buf));
    }

    if (variant === 'analysis') {
      const {
        loadRequirementAnalysisTemplateBuffer,
        ANALYSIS_TEMPLATE_FILE_NAME,
      } = require('../utils/requirement/requirementAnalysisTemplateBuilder');
      const buf = await loadRequirementAnalysisTemplateBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${ANALYSIS_TEMPLATE_FILE_NAME}"`
      );
      return res.send(Buffer.from(buf));
    }

    const buf = await buildRequirementTemplateBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${TEMPLATE_FILE_NAME}"`);
    return res.send(Buffer.from(buf));
  } catch (err) {
    return jsonError(res, err);
  }
}

async function previewImport(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'file (.xlsx) bắt buộc',
        errorCode: 'REQ_IMPORT_FILE_REQUIRED',
      });
    }
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId bắt buộc' });
    }
    const data = await previewRequirementImport({
      userId,
      organizationId,
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname || '',
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function confirmImport(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!organizationId || !sessionId) {
      return res.status(400).json({ success: false, message: 'organizationId và sessionId bắt buộc' });
    }
    const pack = await confirmRequirementImport({ userId, organizationId, sessionId });
    return res.status(201).json({ success: true, data: pack });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function getAccess(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId bắt buộc' });
    }
    const access = await resolveRequirementAccess({ userId, organizationId });
    return res.json({ success: true, data: access });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function listPacks(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId bắt buộc' });
    }
    const rows = await listRequirementPacks({
      userId,
      organizationId,
      status: req.query?.status,
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function getPack(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    if (!organizationId || !packId) {
      return res.status(400).json({ success: false, message: 'organizationId và packId bắt buộc' });
    }
    const view = String(req.query?.view || 'full').trim();
    const pack = await getRequirementPack({ userId, organizationId, packId, view });
    return res.json({ success: true, data: pack });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function downloadSourceFile(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    if (!organizationId || !packId) {
      return res.status(400).json({ success: false, message: 'organizationId và packId bắt buộc' });
    }
    const { body, fileName, contentType } = await getRequirementPackSourceFile({
      userId,
      organizationId,
      packId,
    });
    const safeName = String(fileName || 'requirement.xlsx').replace(/[^\w.\-() ]+/g, '_');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    if (body && typeof body.pipe === 'function') {
      body.pipe(res);
      return undefined;
    }
    return res.send(body);
  } catch (err) {
    return jsonError(res, err);
  }
}

async function submitPack(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    const pack = await submitRequirementPack({ userId, organizationId, packId });
    return res.json({ success: true, data: pack });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function approvePack(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    const forceApprove =
      req.body?.forceApprove === true ||
      req.body?.forceApprove === 'true' ||
      req.body?.forceApprove === 1;
    const overrideReason = String(
      req.body?.overrideReason || req.body?.reason || ''
    ).trim();
    const pack = await approveRequirementPack({
      userId,
      organizationId,
      packId,
      forceApprove,
      overrideReason,
    });
    return res.json({ success: true, data: pack });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function rejectPack(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    const pack = await rejectRequirementPack({
      userId,
      organizationId,
      packId,
      reason: req.body?.reason,
    });
    return res.json({ success: true, data: pack });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function createProjectFromPack(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    if (!organizationId || !packId) {
      return res.status(400).json({
        success: false,
        message: 'organizationId và packId bắt buộc',
      });
    }
    const data = await createProjectFromRequirementPack({
      userId,
      organizationId,
      packId,
      title: req.body?.title,
      startDate: req.body?.startDate,
      dueDate: req.body?.dueDate ?? req.body?.deadline,
      importWorkItems: Boolean(req.body?.importWorkItems),
      leafAssignments: req.body?.leafAssignments,
      applyAssignees: req.body?.applyAssignees !== false,
      taskIds: Array.isArray(req.body?.taskIds) ? req.body.taskIds : null,
      forceApprove:
        req.body?.forceApprove === true ||
        req.body?.forceApprove === 'true' ||
        req.body?.forceApprove === 1,
      overrideReason: String(
        req.body?.overrideReason || req.body?.reason || ''
      ).trim(),
      idempotencyKey: req.body?.idempotencyKey
        ? String(req.body.idempotencyKey).trim()
        : null,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function createIntakeDraft(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId bắt buộc' });
    }
    const pack = await createIntakeDraftPack({
      userId,
      organizationId,
      title: req.body?.title,
      description: req.body?.description,
      customerName: req.body?.customerName,
      startDate: req.body?.startDate,
      dueDate: req.body?.dueDate ?? req.body?.deadline,
      priority: req.body?.priority,
      sourceFileName: req.body?.sourceFileName,
      importSessionId: req.body?.importSessionId,
      analysisMode: req.body?.analysisMode,
      projectId: req.body?.projectId,
    });
    return res.status(201).json({ success: true, data: pack });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function listPackCustomerDocuments(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    const data = await analysisService.listCustomerDocumentsForPack({
      userId,
      organizationId,
      packId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function uploadPackCustomerDocument(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    const file = req.file;
    const body = req.body || {};
    const data = await analysisService.createCustomerDocumentForPack({
      userId,
      organizationId,
      packId,
      body,
      fileBuffer: file?.buffer || null,
      fileName: file?.originalname || null,
      mimeType: file?.mimetype || null,
      sizeBytes: file?.size != null ? file.size : null,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function deletePack(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    if (!organizationId || !packId) {
      return res.status(400).json({
        success: false,
        message: 'organizationId và packId bắt buộc',
      });
    }
    const data = await deleteRequirementPack({ userId, organizationId, packId });
    return res.json({ success: true, data });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function getAiAnalysis(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    if (!organizationId || !packId) {
      return res.status(400).json({
        success: false,
        message: 'organizationId và packId bắt buộc',
      });
    }
    const view = String(req.query?.view || 'summary').trim().toLowerCase();
    if (view === 'wizard') {
      const job = String(req.query?.job || '').trim();
      const data = await getAiAnalysisWizardJob({
        userId,
        organizationId,
        packId,
        job,
      });
      return res.json({ success: true, data });
    }
    const data = await getAiAnalysisSummary({ userId, organizationId, packId });
    return res.json({ success: true, data });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function createAiAnalysisSnapshot(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    if (!organizationId || !packId) {
      return res.status(400).json({
        success: false,
        message: 'organizationId và packId bắt buộc',
      });
    }
    const { meta } = await createOrReuseAiAnalysisSnapshot({
      userId,
      organizationId,
      packId,
      force: Boolean(req.body?.force),
    });
    return res.json({ success: true, data: meta });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function getAiAnalysisSnapshot(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    if (!organizationId || !packId) {
      return res.status(400).json({
        success: false,
        message: 'organizationId và packId bắt buộc',
      });
    }
    const meta = await getActiveAiAnalysisSnapshotMeta({
      userId,
      organizationId,
      packId,
    });
    return res.json({ success: true, data: meta });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function runAiAnalysis(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    if (!organizationId || !packId) {
      return res.status(400).json({
        success: false,
        message: 'organizationId và packId bắt buộc',
      });
    }
    const data = await runAiAnalysisJob({
      userId,
      organizationId,
      packId,
      job: req.body?.job,
      force: Boolean(req.body?.force),
    });
    // Remote planning (AI_PLANNING_REMOTE=1) → 202 Accepted
    if (data?.accepted && data?.httpStatus === 202) {
      return res.status(202).json({ success: true, data });
    }
    return res.json({ success: true, data });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function confirmAiAnalysis(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    if (!organizationId || !packId) {
      return res.status(400).json({
        success: false,
        message: 'organizationId và packId bắt buộc',
      });
    }
    const data = await confirmAiAnalysisJob({
      userId,
      organizationId,
      packId,
      job: req.body?.job,
      phase: req.body?.phase,
      edits: req.body?.edits ?? null,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function startPhaseAiPlanning(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    if (!organizationId || !packId) {
      return res.status(400).json({
        success: false,
        message: 'organizationId và packId bắt buộc',
      });
    }
    const data = await startPhaseAiPlanningRun({
      userId,
      organizationId,
      packId,
      phase: req.body?.phase || 'how',
      force: Boolean(req.body?.force),
      mode: req.body?.mode || '',
      feedback: req.body?.feedback || '',
    });
    const httpStatus = Number(data?.httpStatus) === 200 ? 200 : 202;
    return res.status(httpStatus).json({ success: true, data });
  } catch (err) {
    return jsonError(res, err);
  }
}

async function exportAiAnalysisSheet11Ctrl(req, res) {
  try {
    const organizationId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const packId = String(req.params.packId || '').trim();
    if (!organizationId || !packId) {
      return res.status(400).json({
        success: false,
        message: 'organizationId và packId bắt buộc',
      });
    }
    const { buffer, fileName } = await exportAiAnalysisSheet11({
      userId,
      organizationId,
      packId,
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err) {
    return jsonError(res, err);
  }
}

module.exports = {
  downloadTemplate,
  previewImport,
  confirmImport,
  getAccess,
  listPacks,
  getPack,
  downloadSourceFile,
  submitPack,
  approvePack,
  rejectPack,
  deletePack,
  createProjectFromPack,
  createIntakeDraft,
  listPackCustomerDocuments,
  uploadPackCustomerDocument,
  getAiAnalysis,
  createAiAnalysisSnapshot,
  getAiAnalysisSnapshot,
  runAiAnalysis,
  confirmAiAnalysis,
  startPhaseAiPlanning,
  exportAiAnalysisSheet11: exportAiAnalysisSheet11Ctrl,
};
