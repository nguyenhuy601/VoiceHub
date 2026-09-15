const deliveryPlanningService = require('../services/deliveryPlanning.service');

function getUserId(req) {
  return req.user?.id || req.headers['x-user-id'];
}

function handleError(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    success: false,
    message: err.message || 'Lỗi delivery planning',
    errorCode: err.errorCode || undefined,
    details: err.details || undefined,
  });
}

async function listArtifacts(req, res) {
  try {
    const data = await deliveryPlanningService.listArtifacts({
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
    const data = await deliveryPlanningService.getArtifact({
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
    const data = await deliveryPlanningService.createArtifact({
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
    const data = await deliveryPlanningService.updateArtifact({
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
    const data = await deliveryPlanningService.transitionArtifact({
      userId: getUserId(req),
      projectId: req.params.projectId,
      artifactId: req.params.artifactId,
      toStatus: req.body?.toStatus || req.body?.status,
      note: req.body?.note,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function listBaselines(req, res) {
  try {
    const data = await deliveryPlanningService.listBaselines({
      userId: getUserId(req),
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function cutBaseline(req, res) {
  try {
    const data = await deliveryPlanningService.cutBaseline({
      userId: getUserId(req),
      projectId: req.params.projectId,
      body: req.body || {},
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getSummary(req, res) {
  try {
    const data = await deliveryPlanningService.planningSummary({
      userId: getUserId(req),
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function suggest(req, res) {
  try {
    const data = await deliveryPlanningService.suggestArtifacts({
      userId: getUserId(req),
      projectId: req.params.projectId,
      kind: req.body?.kind || req.query.kind,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

async function publishWbs(req, res) {
  try {
    const data = await deliveryPlanningService.publishWbsToDevelopment({
      userId: getUserId(req),
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  listArtifacts,
  getArtifact,
  createArtifact,
  updateArtifact,
  transitionArtifact,
  listBaselines,
  cutBaseline,
  getSummary,
  suggest,
  publishWbs,
};
