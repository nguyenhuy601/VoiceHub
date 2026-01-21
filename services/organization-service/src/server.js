const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const organizationRoutes = require('./routes/organizationRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const teamRoutes = require('./routes/teamRoutes');
const memberRoutes = require('./routes/memberRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3013;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Database
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voice-chat-organization', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB error:', err));

// Health check
app.get('/health', (req, res) => {
  res.json({
    service: 'organization-service',
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/organizations', organizationRoutes);
app.use('/api/organizations/:orgId/departments', departmentRoutes);
app.use('/api/organizations/:orgId/departments/:deptId/teams', teamRoutes);
app.use('/api/organizations/:orgId/members', memberRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🏢 Organization Service running on port ${PORT}`);
});

module.exports = app;
