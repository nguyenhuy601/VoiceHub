/**
 * Curated paths — BFF.
 */

const { buildOperation, pathParam } = require('../components/op.helpers');

module.exports = {
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
