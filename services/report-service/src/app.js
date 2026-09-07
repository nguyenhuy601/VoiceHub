const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const internalGatewayAuth = require('@enterprise/shared/middleware/internalGatewayAuth');
const {
  getReportAggregatorMode,
  resolveAnalyticsMongoUri,
} = require('@enterprise/shared/config/reportServiceFlags');
require('dotenv').config();

const reportRoutes = require('./routes/report.routes');
const internalReportRoutes = require('./routes/internalReport.routes');

const app = express();
app.use(createCorsMiddleware());
app.use(express.json({ limit: '1mb' }));

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

app.use('/api/reports/v1', reportRoutes);
app.use('/internal/reports/v1', internalGatewayAuth, internalReportRoutes);

module.exports = app;
