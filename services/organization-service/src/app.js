const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const { mongoose } = require('@enterprise/shared/config/mongo');
const errorHandler = require('./middleware/errorHandler');

const { sendServiceError } = require('./middleware/sendServiceError');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Middleware
app.use(createCorsMiddleware());
/* 5mb: document metadata payloads (fileUrl + version history) từ document-service cũ. */
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

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
const hierarchyRoutes = require('./routes/hierarchyRoutes');
const internalGatewayAuth = require('@enterprise/shared/middleware/internalGatewayAuth');
const internalOrganizationRoutes = require('./routes/internalOrganization.routes');
const memberController = require('./controllers/memberController');

/** Public — xác nhận email lời mời công ty (không JWT) */
app.post('/api/organizations/company-invites/accept', (req, res, next) => {
  Promise.resolve(memberController.acceptCompanyInvite(req, res, next)).catch(next);
});

app.use('/api/organizations/internal', internalGatewayAuth, internalOrganizationRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/organizations/:orgId/departments', departmentRoutes);
app.use('/api/organizations/:orgId/members', memberRoutes);
app.use('/api/organizations/:orgId/departments/:deptId/channels', channelRoutes);
// Legacy compatibility while FE migrates from teams -> channels.
app.use('/api/organizations/:orgId/departments/:deptId/teams', teamRoutes);
app.use('/api/organizations/:orgId/hierarchy', hierarchyRoutes);

/** Derived DM roster — alias `/api/friends` (friend-service graph retired). */
const internalDmRosterRoutes = require('./routes/internalDmRoster.routes');
const dmRosterRoutes = require('./routes/dmRoster.routes');
app.use('/api/friends/internal', internalGatewayAuth, internalDmRosterRoutes);
app.use('/api/friends', dmRosterRoutes);

/** Documents — lift-and-shift from document-service (keep path `/api/documents`). */
const { gatewayUserFromTrustedHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const requireGatewayUser = require('./middleware/requireGatewayUser');
const documentRoutes = require('./routes/document.routes');
const internalDocumentRoutes = require('./routes/internal.document.routes');
app.use('/api/documents', gatewayUserFromTrustedHeaders, requireGatewayUser);
app.use('/api/documents', documentRoutes);
app.use('/internal/documents', internalGatewayAuth, internalDocumentRoutes);

app.use((req, res) => {
  sendServiceError(res, 404, {
    errorCode: 'ORG_ROUTE_NOT_FOUND',
    messageUser: 'Không tìm thấy đường dẫn yêu cầu.',
    message: 'Không tìm thấy đường dẫn yêu cầu.',
  });
});

app.use(errorHandler);

module.exports = app;

