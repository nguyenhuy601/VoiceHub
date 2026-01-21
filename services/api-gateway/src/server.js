const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));

// Logging
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Service routes configuration
const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  user: process.env.USER_SERVICE_URL || 'http://localhost:3004',
  organization: process.env.ORGANIZATION_SERVICE_URL || 'http://localhost:3013',
  chatSystem: process.env.CHAT_SYSTEM_SERVICE_URL || 'http://localhost:3006',
  chatRoom: process.env.CHAT_ROOM_SERVICE_URL || 'http://localhost:3007',
  chatUser: process.env.CHAT_USER_SERVICE_URL || 'http://localhost:3008',
  voice: process.env.VOICE_SERVICE_URL || 'http://localhost:3005',
  task: process.env.TASK_SERVICE_URL || 'http://localhost:3009',
  document: process.env.DOCUMENT_SERVICE_URL || 'http://localhost:3010',
  friend: process.env.FRIEND_SERVICE_URL || 'http://localhost:3002',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003',
  rolePermission: process.env.ROLE_PERMISSION_SERVICE_URL || 'http://localhost:3014',
};

// Proxy configuration
const proxyOptions = (target) => ({
  target,
  changeOrigin: true,
  pathRewrite: (path, req) => {
    return path;
  },
  onError: (err, req, res) => {
    console.error(`Proxy error for ${target}:`, err.message);
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'The requested service is currently unavailable. Please try again later.',
    });
  },
  onProxyReq: (proxyReq, req, res) => {
    // Log proxy requests
    console.log(`[PROXY] ${req.method} ${req.path} -> ${target}`);
  },
});

// Routes
app.use('/api/auth', createProxyMiddleware(proxyOptions(services.auth)));
app.use('/api/users', createProxyMiddleware(proxyOptions(services.user)));
app.use('/api/organizations', createProxyMiddleware(proxyOptions(services.organization)));
app.use('/api/chat/system', createProxyMiddleware(proxyOptions(services.chatSystem)));
app.use('/api/chat/rooms', createProxyMiddleware(proxyOptions(services.chatRoom)));
app.use('/api/chat/users', createProxyMiddleware(proxyOptions(services.chatUser)));
app.use('/api/voice', createProxyMiddleware(proxyOptions(services.voice)));
app.use('/api/tasks', createProxyMiddleware(proxyOptions(services.task)));
app.use('/api/documents', createProxyMiddleware(proxyOptions(services.document)));
app.use('/api/friends', createProxyMiddleware(proxyOptions(services.friend)));
app.use('/api/notifications', createProxyMiddleware(proxyOptions(services.notification)));
app.use('/api/roles', createProxyMiddleware(proxyOptions(services.rolePermission)));
app.use('/api/permissions', createProxyMiddleware(proxyOptions(services.rolePermission)));

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'The requested endpoint does not exist' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Gateway error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
  });
});

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('\n📡 Configured Services:');
  Object.entries(services).forEach(([name, url]) => {
    console.log(`  - ${name.padEnd(15)} -> ${url}`);
  });
});

module.exports = app;
