const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { services } = require('./config/services');
require('dotenv').config();

const app = express();
const VOICE_SIGNAL_PATH = process.env.VOICE_SIGNAL_PATH || '/voice-socket';

// Middleware
app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// Proxy Socket.IO polling traffic before auth/permission middlewares.
app.use(
  createProxyMiddleware({
    target: services.socket.url,
    changeOrigin: true,
    ws: false,
    xfwd: true,
    pathFilter: '/socket.io',
    logLevel: 'warn',
  })
);

// Proxy voice signaling polling (mediasoup signaling via Socket.IO)
app.use(
  createProxyMiddleware({
    target: services.voice.url,
    changeOrigin: true,
    ws: false,
    xfwd: true,
    pathFilter: VOICE_SIGNAL_PATH,
    logLevel: 'warn',
  })
);

// Routes
const routes = require('./routes');
app.use('/', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

module.exports = app;




