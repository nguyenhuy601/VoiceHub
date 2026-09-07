const {
  getDashboardSummary,
  saveSnapshot,
} = require('../services/dashboardReadModel.redis');
const { isUsableDashboardSummary } = require('@enterprise/shared/utils/dashboardReadModelShape');
const {
  getUserPerformance,
  listUserPerformance,
  getEstimateHints,
  upsertRollup,
} = require('../services/userPerformance.warehouse');

function requireGatewayUser(req, res, next) {
  const uid = req.user?.id || req.user?.userId || req.headers['x-user-id'];
  if (!uid) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  req.user = req.user || { id: String(uid) };
  return next();
}

async function getMyDashboard(req, res) {
  try {
    const userId = String(req.user.id || req.user.userId || req.headers['x-user-id']);
    const data = await getDashboardSummary(userId);
    if (!isUsableDashboardSummary(data)) {
      return res.status(404).json({ success: false, message: 'Dashboard read model miss' });
    }
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function getInternalDashboard(req, res) {
  try {
    const data = await getDashboardSummary(req.params.userId);
    if (!isUsableDashboardSummary(data)) {
      return res.status(404).json({ success: false, message: 'Dashboard read model miss' });
    }
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function putInternalDashboard(req, res) {
  try {
    const { applied, doc } = await saveSnapshot(
      req.params.userId,
      req.body || {},
      req.body?.eventId || req.headers['x-event-id']
    );
    return res.json({ success: true, data: { applied, summary: doc } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function listPerformance(req, res) {
  try {
    const organizationId = String(
      req.query.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId required' });
    }
    const actorUserId = String(req.user.id || req.user.userId);
    const data = await listUserPerformance({
      organizationId,
      actorUserId,
      windowDays: req.query.windowDays || req.query.window || 90,
      asOf: req.query.asOf,
      limit: req.query.limit,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function getUserPerformanceReport(req, res) {
  try {
    const organizationId = String(
      req.query.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId required' });
    }
    const actorUserId = String(req.user.id || req.user.userId);
    const data = await getUserPerformance({
      organizationId,
      userId: req.params.userId,
      actorUserId,
      windowDays: req.query.windowDays || req.query.window || 90,
      asOf: req.query.asOf,
    });
    if (!data) {
      return res.status(404).json({ success: false, message: 'Performance profile not found' });
    }
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function getEstimateHintsReport(req, res) {
  try {
    const organizationId = String(
      req.query.organizationId || req.headers['x-organization-id'] || ''
    ).trim();
    const assigneeId = String(req.query.assigneeId || '').trim();
    if (!organizationId || !assigneeId) {
      return res.status(400).json({ success: false, message: 'organizationId and assigneeId required' });
    }
    const actorUserId = String(req.user.id || req.user.userId);
    const data = await getEstimateHints({
      organizationId,
      assigneeId,
      actorUserId,
      baselineHours: req.query.baselineHours,
      issueType: req.query.issueType,
      windowDays: req.query.windowDays || 90,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

async function putInternalPerformance(req, res) {
  try {
    const doc = await upsertRollup({
      ...(req.body || {}),
      userId: req.params.userId,
      source: req.body?.source || 'rebuild',
    });
    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  requireGatewayUser,
  getMyDashboard,
  getInternalDashboard,
  putInternalDashboard,
  listPerformance,
  getUserPerformanceReport,
  getEstimateHintsReport,
  putInternalPerformance,
};
