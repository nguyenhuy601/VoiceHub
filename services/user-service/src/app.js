const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-service' });
});

// User routes
const userRoutes = require('./routes/user.routes');
app.use('/api/users', userRoutes);

module.exports = app;

