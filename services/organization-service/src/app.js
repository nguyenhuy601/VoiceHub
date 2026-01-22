const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'organization-service' });
});

// Organization routes
const organizationRoutes = require('./routes/organization.routes');
app.use('/api/organizations', organizationRoutes);

// Server routes
const serverRoutes = require('./routes/server.routes');
app.use('/api/servers', serverRoutes);

module.exports = app;

