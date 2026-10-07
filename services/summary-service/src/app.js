const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const { gatewayUserFromTrustedHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const summaryRoutes = require('./routes/summary.routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.use(createCorsMiddleware());
app.use(express.json({ limit: '16kb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'summary-service' });
});

app.use('/api/ai/summaries', gatewayUserFromTrustedHeaders, summaryRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
