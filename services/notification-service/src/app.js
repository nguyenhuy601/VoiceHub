const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');

const app = express();

// Middleware
app.use(createCorsMiddleware());
app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Set UTF-8 charset cho tất cả JSON responses
app.set('json spaces', 2);
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

// Notification routes — userId từ header x-user-id (do API Gateway gắn sau JWT)
const gatewayUserMiddleware = require('./middlewares/gatewayUser');
const notificationRoutes = require('./routes/notification.routes');
app.use('/api/notifications', gatewayUserMiddleware, notificationRoutes);

const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

