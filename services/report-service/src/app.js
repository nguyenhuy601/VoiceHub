const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const { gatewayUserFromTrustedHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const internalGatewayAuth = require('@enterprise/shared/middleware/internalGatewayAuth');
const {
  getReportAggregatorMode,
  resolveAnalyticsMongoUri,
} = require('@enterprise/shared/config/reportServiceFlags');
const {
  getDashboardSummary,
  saveSnapshot,
} = require('./services/dashboardReadModel.redis');
const { isUsableDashboardSummary } = require('@enterprise/shared/utils/dashboardReadModelShape');
require('dotenv').config();

const app = express();
app.use(createCorsMiddleware());
app.use(express.json({ limit: '1mb' }));

function requireGatewayUser(req, res, next) {
  const uid = req.user?.id || req.user?.userId || req.headers['x-user-id'];
  if (!uid) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  req.user = req.user || { id: String(uid) };
  return next();
}

app.get('/health', (req, res) => {
  const mode = getReportAggregatorMode();
  const analyticsUriSet = Boolean(resolveAnalyticsMongoUri());
  res.json({
    status: 'ok',
    service: 'report-service',
    mode,
    analyticsConfigured: analyticsUriSet,
    ownership: 'dashboard-rm',
  });
});

app.get('/api/reports/v1/status', (req, res) => {
  res.json({
    apiVersion: 'v1',
    mode: getReportAggregatorMode(),
    ready: true,
    dashboardReadModel: true,
    userPerformance: true,
  });
});

app.get(
  '/api/reports/v1/dashboard/me',
  gatewayUserFromTrustedHeaders,
  requireGatewayUser,
  async (req, res) => {
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
);

app.get(
  '/internal/reports/v1/dashboard/:userId',
  internalGatewayAuth,
  async (req, res) => {
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
);

/** Test/S2S upsert snapshot — không public FE. */
app.put(
  '/internal/reports/v1/dashboard/:userId',
  internalGatewayAuth,
  async (req, res) => {
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
);

const {
  getUserPerformance,
  listUserPerformance,
  getEstimateHints,
  upsertRollup,
} = require('./services/userPerformance.warehouse');

app.get(
  '/api/reports/v1/performance',
  gatewayUserFromTrustedHeaders,
  requireGatewayUser,
  async (req, res) => {
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
);

app.get(
  '/api/reports/v1/performance/users/:userId',
  gatewayUserFromTrustedHeaders,
  requireGatewayUser,
  async (req, res) => {
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
);

app.get(
  '/api/reports/v1/performance/estimate-hints',
  gatewayUserFromTrustedHeaders,
  requireGatewayUser,
  async (req, res) => {
    try {
      const organizationId = String(
        req.query.organizationId || req.headers['x-organization-id'] || ''
      ).trim();
      const assigneeId = String(req.query.assigneeId || '').trim();
      if (!organizationId || !assigneeId) {
        return res
          .status(400)
          .json({ success: false, message: 'organizationId and assigneeId required' });
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
);

/** Internal upsert rollup (ETL / tests). */
app.put(
  '/internal/reports/v1/performance/users/:userId',
  internalGatewayAuth,
  async (req, res) => {
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
);

module.exports = app;
