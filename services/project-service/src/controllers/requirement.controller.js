const {
  TEMPLATE_FILE_NAME,
} = require('../constants/requirementTemplate.constants');
const { buildRequirementTemplateBuffer } = require('../utils/requirementTemplateBuilder');
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
} = require('../services/requirementPack.service');
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
    const pack = await approveRequirementPack({ userId, organizationId, packId });
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
      edits: req.body?.edits ?? null,
    });
    return res.json({ success: true, data });
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
  getAiAnalysis,
  runAiAnalysis,
  confirmAiAnalysis,
  exportAiAnalysisSheet11: exportAiAnalysisSheet11Ctrl,
};
