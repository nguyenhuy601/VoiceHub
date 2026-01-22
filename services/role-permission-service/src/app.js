const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'role-permission-service' });
});

// Role routes
const roleRoutes = require('./routes/role.routes');
app.use('/api/roles', roleRoutes);

// Permission routes
const permissionRoutes = require('./routes/permission.routes');
app.use('/api/permissions', permissionRoutes);

module.exports = app;

