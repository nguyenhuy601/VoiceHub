/**
 * Curated Organization + Master Data + HR positions.
 */

const { buildOperation, pathParam } = require('../components/op.helpers');
const { PageQuery, SizeQuery } = require('../components/pagination.schemas');

module.exports = {
  '/api/organizations/my': {
    get: buildOperation({
      operationId: 'listMyOrganizations',
      tags: ['Organizations'],
      summary: 'List my organizations',
      description: 'Organizations user đang membership.',
      requireNotFound: false,
      successExample: {
        success: true,
        data: [{ _id: '507f1f77bcf86cd799439011', name: 'Acme' }],
      },
    }),
  },
  '/api/organizations/{orgId}/org-roles': {
    get: buildOperation({
      operationId: 'listOrgRoles',
      tags: ['Organizations'],
      summary: 'List Org Role catalog',
      description: 'Runtime catalog sync từ Master Data enabledOrganizationRoleKeys.',
      parameters: [pathParam('orgId', 'Organization id')],
      successExample: {
        success: true,
        data: { roles: [{ key: 'team_lead', label: 'Cơ cấu — Team Lead', enabled: true }] },
      },
    }),
  },
  '/api/organizations/{orgId}/hr-positions': {
    get: buildOperation({
      operationId: 'listHrPositions',
      tags: ['Organizations'],
      summary: 'List enabled HR Positions',
      description: 'Chức danh enabled — cùng nguồn User Edit / Pos Assign.',
      parameters: [pathParam('orgId', 'Organization id')],
      successExample: {
        success: true,
        data: { positions: [{ key: 'backend_engineer', title: 'Backend Engineer' }] },
      },
    }),
  },
  '/api/organizations/{orgId}/master-data': {
    get: buildOperation({
      operationId: 'getOrgMasterData',
      tags: ['Organizations'],
      summary: 'Get Master Data catalog',
      description: 'Lớp A enable keys + catalogs.',
      parameters: [pathParam('orgId', 'Organization id')],
      successExample: {
        success: true,
        data: {
          companySize: 'startup',
          masterData: { enabledOrganizationRoleKeys: ['team_lead'] },
          catalogs: { organizationRoles: [] },
        },
      },
    }),
  },
  '/api/organizations/{orgId}/master-data/enabled': {
    patch: buildOperation({
      operationId: 'patchOrgMasterDataEnabled',
      tags: ['Organizations'],
      summary: 'Patch Master Data enabled keys',
      description: 'Cập nhật enabled*Keys; sync OrgRoleCatalog.',
      parameters: [pathParam('orgId', 'Organization id')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                companySize: {
                  type: 'string',
                  enum: ['startup', 'sme', 'mid', 'enterprise'],
                  description: 'Company size template',
                  example: 'startup',
                },
                enabledOrganizationRoleKeys: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['team_lead', 'resource_manager'],
                },
                enabledPositionKeys: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['backend_engineer'],
                },
                enabledProjectRoleKeys: {
                  type: 'array',
                  items: { type: 'string' },
                },
                enabledDepartmentKeys: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            example: {
              enabledOrganizationRoleKeys: ['team_lead', 'resource_manager'],
            },
          },
        },
      },
      successExample: { success: true, data: { companySize: 'startup' } },
    }),
  },
  '/api/organizations/{orgId}/members': {
    get: buildOperation({
      operationId: 'listOrgMembers',
      tags: ['OrgStructure'],
      summary: 'List organization members',
      description:
        'Danh sách thành viên. Hỗ trợ phân trang page/size (runtime limit↔size). Response docs: PageResponse.',
      parameters: [
        pathParam('orgId', 'Organization id'),
        PageQuery,
        SizeQuery,
      ],
      successSchema: {
        allOf: [
          { $ref: '#/components/schemas/ApiSuccess' },
          {
            type: 'object',
            properties: {
              data: { $ref: '#/components/schemas/PageResponse' },
            },
          },
        ],
      },
      successExample: {
        success: true,
        data: {
          page: 1,
          size: 20,
          totalElements: 2,
          totalPages: 1,
          content: [{ userId: '507f1f77bcf86cd799439011', role: 'member' }],
        },
      },
    }),
  },
};
