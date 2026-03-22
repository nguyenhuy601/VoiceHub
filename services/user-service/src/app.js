const express = require('express');
const cors = require('cors');
const { getCryptoMetrics } = require('/shared');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

module.exports = app;

