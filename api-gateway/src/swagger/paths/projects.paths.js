/**
 * Curated Projects / Tasks samples (PageResponse + member roles).
 */

const { buildOperation, pathParam } = require('../components/op.helpers');
const { PageQuery, SizeQuery } = require('../components/pagination.schemas');

module.exports = {
  '/api/projects': {
    get: buildOperation({
      operationId: 'listProjects',
      tags: ['Projects'],
      summary: 'List projects',
      description: 'Projects visible to user. Query organizationId optional. Pagination page/size.',
      requireNotFound: false,
      parameters: [
        {
          name: 'organizationId',
          in: 'query',
          required: false,
          description: 'Filter by org',
          schema: { type: 'string', example: '507f1f77bcf86cd799439011' },
        },
        PageQuery,
        SizeQuery,
      ],
      successExample: {
        success: true,
        data: {
          page: 1,
          size: 20,
          totalElements: 1,
          totalPages: 1,
          content: [{ _id: '507f1f77bcf86cd799439011', title: 'Demo Project' }],
        },
      },
    }),
    post: buildOperation({
      operationId: 'createProject',
      tags: ['Projects'],
      summary: 'Create project',
      description: 'Tạo dự án mới trong org.',
      requireNotFound: false,
      successStatus: 201,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'organizationId'],
              properties: {
                title: { type: 'string', example: 'Demo Project', description: 'Tên dự án' },
                organizationId: {
                  type: 'string',
                  example: '507f1f77bcf86cd799439011',
                  description: 'Org id',
                },
              },
            },
            example: { title: 'Demo Project', organizationId: '507f1f77bcf86cd799439011' },
          },
        },
      },
      successExample: { success: true, data: { _id: '507f1f77bcf86cd799439011', title: 'Demo Project' } },
    }),
  },
  '/api/projects/{projectId}/members': {
    get: buildOperation({
      operationId: 'listProjectMembers',
      tags: ['Projects'],
      summary: 'List project members',
      description: 'ProjectMembership + roles.',
      parameters: [pathParam('projectId', 'Project id')],
      successExample: {
        success: true,
        data: [{ userId: '507f1f77bcf86cd799439011', projectRole: { key: 'backend_developer' } }],
      },
    }),
  },
  '/api/projects/{projectId}/members/{memberUserId}/roles': {
    put: buildOperation({
      operationId: 'putProjectMemberRoles',
      tags: ['Projects'],
      summary: 'Set project member roles',
      description: 'SSOT write path project-level (Team panel + Planner).',
      parameters: [
        pathParam('projectId', 'Project id'),
        pathParam('memberUserId', 'Member user id'),
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['projectRoleKeys'],
              properties: {
                projectRoleKeys: {
                  type: 'array',
                  minItems: 1,
                  items: { type: 'string' },
                  description: 'Enabled project role keys',
                  example: ['backend_developer'],
                },
              },
            },
            example: { projectRoleKeys: ['backend_developer'] },
          },
        },
      },
      successExample: { success: true, data: { roles: ['backend_developer'] } },
    }),
  },
  '/api/projects/role-catalog': {
    get: buildOperation({
      operationId: 'listProjectRoleCatalog',
      tags: ['Projects'],
      summary: 'Project role catalog',
      description: 'Enabled Master Data project roles. Header x-organization-id bắt buộc.',
      requireNotFound: false,
      parameters: [
        {
          name: 'x-organization-id',
          in: 'header',
          required: true,
          description: 'Organization context',
          schema: { type: 'string', example: '507f1f77bcf86cd799439011' },
        },
      ],
      successExample: {
        success: true,
        data: [{ key: 'backend_developer', label: 'Dự án — Backend Developer', canAssign: true }],
      },
    }),
  },
};
