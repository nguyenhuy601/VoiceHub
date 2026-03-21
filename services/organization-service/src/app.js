const express = require('express');
const cors = require('cors');
const { mongoose } = require('/shared/config/mongo');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'organization-service',
    mongoReadyState: mongoose.connection?.readyState,
  });
});

const organizationRoutes = require('./routes/organizationRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const memberRoutes = require('./routes/memberRoutes');
const teamRoutes = require('./routes/teamRoutes');
const channelRoutes = require('./routes/channelRoutes');

app.use('/api/organizations', organizationRoutes);
app.use('/api/organizations/:orgId/departments', departmentRoutes);
app.use('/api/organizations/:orgId/members', memberRoutes);
app.use('/api/organizations/:orgId/departments/:deptId/channels', channelRoutes);
// Legacy compatibility while FE migrates from teams -> channels.
app.use('/api/organizations/:orgId/departments/:deptId/teams', teamRoutes);

app.use(errorHandler);

module.exports = app;

