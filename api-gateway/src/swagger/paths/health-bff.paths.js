/**
 * Curated paths — Health + BFF.
 */

const { buildOperation, pathParam } = require('../components/op.helpers');

module.exports = {
  '/health': {
    get: buildOperation({
      operationId: 'getGatewayHealth',
      tags: ['Health'],
      summary: 'Gateway liveness',
      description: 'Không cần JWT.',
      public: true,
      requireNotFound: false,
      successExample: {
        success: true,
        message: 'API Gateway is running',
        timestamp: '2026-08-06T07:00:00.000Z',
      },
    }),
  },
  '/api/health/gateway-trust': {
    get: buildOperation({
      operationId: 'getGatewayTrust',
      tags: ['Health'],
      summary: 'Kiểm tra GATEWAY_INTERNAL_TOKEN đã cấu hình',
      description: 'Public diagnostic — không lộ giá trị token.',
      public: true,
      requireNotFound: false,
      successExample: {
        success: true,
        gatewayTrustConfigured: true,
        message: 'Gateway trust đã cấu hình (GATEWAY_INTERNAL_TOKEN).',
      },
    }),
  },
  '/api/bootstrap': {
    get: buildOperation({
      operationId: 'getBootstrap',
      tags: ['BFF'],
      summary: 'Bootstrap session / app shell',
      description: 'Aggregate dữ liệu khởi động client qua Gateway BFF.',
      requireNotFound: false,
      successExample: { success: true, data: { user: {}, organizations: [] } },
    }),
  },
  '/api/dashboard/summary': {
    get: buildOperation({
      operationId: 'getDashboardSummary',
      tags: ['BFF'],
      summary: 'Dashboard summary',
      description: 'Tóm tắt dashboard cá nhân / org context.',
      requireNotFound: false,
      parameters: [
        {
          name: 'organizationId',
          in: 'query',
          required: false,
          description: 'Org context (optional)',
          schema: { type: 'string', example: '507f1f77bcf86cd799439011' },
        },
      ],
      successExample: { success: true, data: { widgets: [] } },
    }),
  },
  '/api/organizations/{orgId}/shell': {
    get: buildOperation({
      operationId: 'getOrgShellBff',
      tags: ['BFF'],
      summary: 'Org shell (BFF)',
      description: 'Nav / membership snapshot cho UI.',
      parameters: [pathParam('orgId', 'Organization id')],
      successExample: { success: true, data: { organization: {}, membership: {} } },
    }),
  },
  '/api/organizations/{orgId}/documents-overview': {
    get: buildOperation({
      operationId: 'getOrgDocumentsOverviewBff',
      tags: ['BFF'],
      summary: 'Documents overview (BFF)',
      description: 'Tổng quan tài liệu theo org.',
      parameters: [pathParam('orgId', 'Organization id')],
      successExample: { success: true, data: { documents: [] } },
    }),
  },
};
