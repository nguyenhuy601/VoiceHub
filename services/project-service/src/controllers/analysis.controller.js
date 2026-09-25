const analysisService = require('../services/analysis.service');

function getUserId(req) {
  return req.user?.id || req.headers['x-user-id'];
}

function handleError(res, err) {
  let status = err.statusCode || 500;
  let message = err.message || 'Lỗi analysis';
  if (!err.statusCode && err.name === 'ValidationError') {
    status = 400;
    message = err.message;
  }
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[analysis]', message, err.stack || '');
  }
  return res.status(status).json({
    success: false,
    message,
    errorCode: err.errorCode || undefined,
    details: err.details || undefined,
  });
}

async function listCustomerDocuments(req, res) {
  try {
    const data = await analysisService.listCustomerDocuments({
      userId: getUserId(req),
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function createCustomerDocument(req, res) {
  try {
    const file = req.file;
    const body = req.body || {};
    const data = await analysisService.createCustomerDocument({
      userId: getUserId(req),
      projectId: req.params.projectId,
      body,
      fileBuffer: file?.buffer || null,
      fileName: file?.originalname || null,
      mimeType: file?.mimetype || null,
      sizeBytes: file?.size != null ? file.size : null,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function listArtifacts(req, res) {
  try {
    const data = await analysisService.listArtifacts({
      userId: getUserId(req),
      projectId: req.params.projectId,
      kind: req.query.kind,
      status: req.query.status,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getArtifact(req, res) {
  try {
    const data = await analysisService.getArtifact({
      userId: getUserId(req),
      projectId: req.params.projectId,
      artifactId: req.params.artifactId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function createArtifact(req, res) {
  try {
    const data = await analysisService.createArtifact({
      userId: getUserId(req),
      projectId: req.params.projectId,
      body: req.body || {},
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function updateArtifact(req, res) {
  try {
    const data = await analysisService.updateArtifactDraft({
      userId: getUserId(req),
      projectId: req.params.projectId,
      artifactId: req.params.artifactId,
      body: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function transitionArtifact(req, res) {
  try {
    const data = await analysisService.transitionArtifactStatus({
      userId: getUserId(req),
      projectId: req.params.projectId,
      artifactId: req.params.artifactId,
      toStatus: req.body?.status || req.body?.toStatus,
      note: req.body?.note || req.body?.rejectionReason || '',
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function bulkTransitionArtifacts(req, res) {
  try {
    const data = await analysisService.bulkTransitionArtifacts({
      userId: getUserId(req),
      projectId: req.params.projectId,
      fromStatus: req.body?.fromStatus,
      toStatus: req.body?.toStatus || req.body?.status,
      note: req.body?.note || '',
      artifactIds: req.body?.artifactIds ?? req.body?.ids ?? null,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function listTraceLinks(req, res) {
  try {
    const data = await analysisService.listTraceLinks({
      userId: getUserId(req),
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function createTraceLink(req, res) {
  try {
    const data = await analysisService.createTraceLink({
      userId: getUserId(req),
      projectId: req.params.projectId,
      body: req.body || {},
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getGapReport(req, res) {
  try {
    const data = await analysisService.computeGapReport({
      userId: getUserId(req),
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function listSrsBaselines(req, res) {
  try {
    const data = await analysisService.listSrsBaselines({
      userId: getUserId(req),
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function cutSrsBaseline(req, res) {
  try {
    const data = await analysisService.cutSrsBaseline({
      userId: getUserId(req),
      projectId: req.params.projectId,
      body: req.body || {},
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function advancePhase2(req, res) {
  try {
    const data = await analysisService.advanceToPhase2({
      userId: getUserId(req),
      projectId: req.params.projectId,
      mode: req.body?.mode,
      packId: req.body?.packId,
      methodology: req.body?.methodology,
      // RULE-21 — opt-in only (seed chính từ PlanningBaseline + publish-wbs)
      importWorkItems: req.body?.importWorkItems === true,
      applyAssignees: req.body?.applyAssignees === true,
      forcePackImport: req.body?.forcePackImport === true,
      skipReadyGate: Boolean(req.body?.skipReadyGate),
      publishWbs: req.body?.publishWbs !== false,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getSrsDraft(req, res) {
  try {
    const data = await analysisService.getSrsDraft({
      userId: getUserId(req),
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function startDeliveryPlanning(req, res) {
  try {
    const data = await analysisService.startDeliveryPlanning({
      userId: getUserId(req),
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function previewAnalysisImport(req, res) {
  try {
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu file Analysis (.xlsx)',
        errorCode: 'IMPORT_SET_ANALYSIS_FILE_REQUIRED',
      });
    }
    const data = await analysisService.previewAnalysisImport({
      userId: getUserId(req),
      projectId: req.params.projectId,
      fileBuffer: file.buffer,
      fileName: file.originalname,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function confirmAnalysisImport(req, res) {
  try {
    const data = await analysisService.confirmAnalysisImport({
      userId: getUserId(req),
      projectId: req.params.projectId,
      sessionId: req.body?.sessionId,
      importSetId: req.body?.importSetId || null,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function listImportSets(req, res) {
  try {
    const importSetService = require('../services/analysisImportSet.service');
    const data = await importSetService.listImportSets({
      userId: getUserId(req),
      projectId: req.params.projectId,
      status: req.query?.status,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function attachRawImportSet(req, res) {
  try {
    const importSetService = require('../services/analysisImportSet.service');
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu file Raw (.xlsx)',
        errorCode: 'IMPORT_SET_RAW_FILE_REQUIRED',
      });
    }
    const data = await importSetService.attachRawDocument({
      userId: getUserId(req),
      projectId: req.params.projectId,
      fileBuffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function trashImportSet(req, res) {
  try {
    const importSetService = require('../services/analysisImportSet.service');
    const data = await importSetService.softDeleteImportSet({
      userId: getUserId(req),
      projectId: req.params.projectId,
      setId: req.params.setId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function restoreImportSet(req, res) {
  try {
    const importSetService = require('../services/analysisImportSet.service');
    const data = await importSetService.restoreImportSet({
      userId: getUserId(req),
      projectId: req.params.projectId,
      setId: req.params.setId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getImportSetDiff(req, res) {
  try {
    const importSetService = require('../services/analysisImportSet.service');
    const data = await importSetService.getImportSetDiff({
      userId: getUserId(req),
      projectId: req.params.projectId,
      setId: req.params.setId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function transitionImportSet(req, res) {
  try {
    const importSetService = require('../services/analysisImportSet.service');
    const data = await importSetService.transitionImportSet({
      userId: getUserId(req),
      projectId: req.params.projectId,
      setId: req.params.setId,
      toStatus: req.body?.toStatus,
      note: req.body?.note || '',
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  listCustomerDocuments,
  createCustomerDocument,
  listArtifacts,
  getArtifact,
  createArtifact,
  updateArtifact,
  transitionArtifact,
  bulkTransitionArtifacts,
  listTraceLinks,
  createTraceLink,
  getGapReport,
  listSrsBaselines,
  cutSrsBaseline,
  advancePhase2,
  getSrsDraft,
  startDeliveryPlanning,
  previewAnalysisImport,
  confirmAnalysisImport,
  listImportSets,
  attachRawImportSet,
  trashImportSet,
  restoreImportSet,
  getImportSetDiff,
  transitionImportSet,
};
