const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const { gatewayUserFromTrustedHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const summaryRoutes = require('./routes/summary.routes');

const app = express();
app.use(createCorsMiddleware());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'summary-service' });
});

app.use('/api/ai/summaries', gatewayUserFromTrustedHeaders, summaryRoutes);

module.exports = app;
