const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const internalGatewayAuth = require('@enterprise/shared/middleware/internalGatewayAuth');

const planningRoutes = require('./routes/internal/planning.routes');
const { registerDefaultTools } = require('./tools/registerDefaultTools');

registerDefaultTools();

const app = express();
app.use(createCorsMiddleware());
app.use(express.json({ limit: '4mb' }));

app.get('/health', (req, res) =>
  res.json({ ok: true, service: 'ai-project-planning-service' })
);

// S2S only — browser never hits this service directly (RULE-11)
app.use('/internal', internalGatewayAuth, planningRoutes);

module.exports = app;
