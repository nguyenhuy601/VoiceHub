const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
require('dotenv').config();

const app = express();
app.use(createCorsMiddleware());
app.use(express.json({ limit: '2mb' }));

/**
 * Scaffold only — full Task CRUD vẫn trên project-service cho đến cutover (ADR-001).
 * Health để Swarm/probe sẵn sàng khi bật image.
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'task-service',
    stranglerMode: process.env.TASK_SERVICE_STRANGLER_MODE || 'off',
    ownership: 'scaffold',
  });
});

app.get('/api/tasks/internal/strangler-status', (req, res) => {
  res.json({
    service: 'task-service',
    readyForCutover: false,
    message: 'Scaffold — implement CRUD + migrate trước khi TASK_SERVICE_STRANGLER_MODE=cutover',
  });
});

module.exports = app;
