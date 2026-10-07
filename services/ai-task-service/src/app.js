const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const { gatewayUserFromTrustedHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const internalGatewayAuth = require('@enterprise/shared/middleware/internalGatewayAuth');

const aiTaskRoutes = require('./routes/aiTask.routes');
const internalAiTaskRoutes = require('./routes/internalAiTask.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.use(createCorsMiddleware());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'ai-task-service' }));

// Mount internal BEFORE parameterized user routes so /:taskId cannot capture "internal".
app.use('/api/ai/tasks/internal', internalGatewayAuth, internalAiTaskRoutes);
app.use('/api/ai/tasks', gatewayUserFromTrustedHeaders, aiTaskRoutes);

app.use(errorHandler);

module.exports = app;
