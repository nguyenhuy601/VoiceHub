const analysisService = require('../services/analysis.service');

function getUserId(req) {
  return req.user?.id || req.headers['x-user-id'];
}

function handleError(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    success: false,
    message: err.message || 'Lỗi analysis',
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
    const data = await analysisService.createCustomerDocument({
      userId: getUserId(req),
      projectId: req.params.projectId,
      body: req.body || {},
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
      importWorkItems: req.body?.importWorkItems !== false,
      applyAssignees: req.body?.applyAssignees !== false,
      skipReadyGate: Boolean(req.body?.skipReadyGate),
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
  listTraceLinks,
  createTraceLink,
  getGapReport,
  listSrsBaselines,
  cutSrsBaseline,
  advancePhase2,
};
