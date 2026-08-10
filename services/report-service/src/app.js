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

module.exports = app;
