const express = require('express');
const fs = require('fs');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const { getCryptoMetrics } = require('@enterprise/shared');
const { uploadsDir } = require('./config/uploadsPath');

const app = express();
app.disable('x-powered-by');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function setNoSniff(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}

function sendRouteNotFound(_req, res) {
  return res.status(404).json({
    success: false,
    message: 'Không tìm thấy tài nguyên.',
    messageUser: 'Không tìm thấy tài nguyên.',
    errorCode: 'USER_ROUTE_NOT_FOUND',
  });
}

// Middleware
app.use(createCorsMiddleware());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
const { protect } = require('./middleware/auth');
// CV PDF chỉ phục vụ parse nội bộ — client không đọc lại file gốc.
app.use('/uploads/cv', sendRouteNotFound);
app.use('/uploads', setNoSniff, protect, express.static(uploadsDir));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-service' });
});

app.get('/health/crypto', (req, res) => {
  res.json({ status: 'ok', service: 'user-service', crypto: getCryptoMetrics() });
});

// User routes
const userRoutes = require('./routes/user.routes');
app.use('/api/users', userRoutes);

app.use(sendRouteNotFound);

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = app;
