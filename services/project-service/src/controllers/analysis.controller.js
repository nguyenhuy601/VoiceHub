const analysisService = require('../services/analysis.service');
const { sendErrorFromCatch, sendServiceError } = require('../middleware/sendServiceError');

function getUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function sendAnalysisError(res, err) {
  let status = Number(err?.statusCode) || 500;
  if (!err?.statusCode && err?.name === 'ValidationError') status = 400;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[analysis]', err?.message, err?.stack || '');
  }
  if (status < 500 && err?.details) {
    return sendServiceError(res, status, {
      errorCode: err.errorCode,
      message: err.message,
      extra: { details: err.details },
    });
  }
  return sendErrorFromCatch(res, err, status, 'Không thể xử lý analysis');
}

async function listCustomerDocuments(req, res) {
  try {
    const format = String(req.query?.format || '')
      .trim()
      .toLowerCase();
    const documentId = String(req.query?.documentId || req.query?.id || '').trim();
    if ((format === 'download' || format === 'bin' || format === 'file') && documentId) {
      const { stream, fileName, mimeType } = await analysisService.downloadCustomerDocument({
        userId: getUserId(req),
        projectId: req.params.projectId,
        documentId,
      });
      res.setHeader('Content-Type', mimeType || 'application/octet-stream');
      const { attachmentHeader } = require('../utils/common/contentDisposition');
      res.setHeader('Content-Disposition', attachmentHeader(fileName || 'document', 'document'));
      if (stream && typeof stream.pipe === 'function') {
        return stream.pipe(res);
      }
      // AWS SDK v3 Body may be async iterable
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return res.send(Buffer.concat(chunks));
    }
    const data = await analysisService.listCustomerDocuments({
      userId: getUserId(req),
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendAnalysisError(res, err);
  }
}

async function createCustomerDocument(req, res) {
  try {
    const data = await analysisService.createCustomerDocument({
      userId: getUserId(req),
      projectId: req.params.projectId,
      body: req.body || {},
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
  }
}

async function advancePhase2(req, res) {
  try {
    const action = String(req.body?.action || 'advance')
      .trim()
      .toLowerCase();
    const userId = getUserId(req);
    const projectId = req.params.projectId;

    if (action === 'preview_staging') {
      const data = await analysisService.buildPhase2StagingPreview({ userId, projectId });
      return res.json({ success: true, data });
    }
    if (action === 'save_staging') {
      const data = await analysisService.savePhase2StagingDraft({
        userId,
        projectId,
        methodology: req.body?.methodology,
        rows: req.body?.rows,
        note: req.body?.note,
      });
      return res.json({ success: true, data });
    }
    if (action === 'submit_staging') {
      const data = await analysisService.submitPhase2ManualStaging({
        userId,
        projectId,
        methodology: req.body?.methodology,
        rows: req.body?.rows,
        note: req.body?.note,
      });
      return res.json({ success: true, data });
    }
    if (action === 'approve_staging' || action === 'request_changes') {
      const data = await analysisService.reviewPhase2ManualStaging({
        userId,
        projectId,
        decision: action === 'approve_staging' ? 'approve' : 'request_changes',
        note: req.body?.note,
      });
      return res.json({ success: true, data });
    }

    const data = await analysisService.advanceToPhase2({
      userId,
      projectId,
      mode: req.body?.mode,
      packId: req.body?.packId,
      methodology: req.body?.methodology,
      // RULE-21 — opt-in only (seed chính từ PlanningBaseline + publish-wbs)
      importWorkItems: req.body?.importWorkItems === true,
      applyAssignees: req.body?.applyAssignees === true,
      forcePackImport: req.body?.forcePackImport === true,
      skipReadyGate: Boolean(req.body?.skipReadyGate),
      publishWbs: req.body?.publishWbs !== false,
      seedBoardTasks: req.body?.seedBoardTasks !== false,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendAnalysisError(res, err);
  }
}

async function getSrsDraft(req, res) {
  try {
    const format = String(req.query?.format || '')
      .trim()
      .toLowerCase();
    if (format === 'xlsx' || format === 'excel') {
      const { buffer, fileName } = await analysisService.exportSrsWorkbook({
        userId: getUserId(req),
        projectId: req.params.projectId,
        baselineId: req.query?.baselineId,
        srsVersion: req.query?.srsVersion,
      });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      const { attachmentHeader } = require('../utils/common/contentDisposition');
      res.setHeader('Content-Disposition', attachmentHeader(fileName, 'srs-draft.xlsx'));
      return res.send(Buffer.from(buffer));
    }
    const data = await analysisService.getSrsDraft({
      userId: getUserId(req),
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
    return sendAnalysisError(res, err);
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
