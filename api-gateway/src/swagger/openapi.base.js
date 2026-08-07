/**
 * OpenAPI 3 base — info, servers, security, shared components.
 */

const path = require('path');
const fs = require('fs');
const common = require('./components/common.schemas');
const pagination = require('./components/pagination.schemas');
const auth = require('./components/auth.schemas');
const upload = require('./components/upload.schemas');

function readGatewayPackageVersion() {
  try {
    const pkgPath = path.join(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return String(pkg.version || '1.0.0');
  } catch {
    return '1.0.0';
  }
}

const MODULE_TAGS = [
  { name: 'Health', description: 'Liveness / gateway trust' },
  { name: 'Auth', description: 'Đăng nhập, token, profile auth' },
  { name: 'BFF', description: 'Gateway BFF aggregate' },
  { name: 'Users', description: 'User profile, avatar, CV' },
  { name: 'Friends', description: 'Friend graph' },
  { name: 'Organizations', description: 'Org, Master Data, HR positions, org roles' },
  { name: 'OrgStructure', description: 'Departments, teams, channels, hierarchy, units' },
  { name: 'Projects', description: 'Projects, members, planning, resources' },
  { name: 'Tasks', description: 'Task boards, tasks, work aliases' },
  { name: 'Chat', description: 'Messages / chat' },
  { name: 'Voice', description: 'Meetings, voice rooms, recordings' },
  { name: 'Documents', description: 'Documents & versions' },
  { name: 'Notifications', description: 'In-app notifications' },
  { name: 'Roles', description: 'System roles & permissions' },
  { name: 'AI', description: 'AI tasks & summaries' },
];

function buildOpenApiBase(env = process.env) {
  const version = String(env.SWAGGER_API_VERSION || readGatewayPackageVersion()).trim() || '1.0.0';
  const contactName = String(env.SWAGGER_CONTACT_NAME || 'VoiceHub Team').trim();
  const contactEmail = String(env.SWAGGER_CONTACT_EMAIL || '').trim();
  const contactUrl = String(env.SWAGGER_CONTACT_URL || '').trim();
  const licenseName = String(env.SWAGGER_LICENSE_NAME || 'ISC').trim();
  const licenseUrl = String(env.SWAGGER_LICENSE_URL || '').trim();
  const serverUrl = String(env.SWAGGER_SERVER_URL || '').trim();

  const contact = { name: contactName };
  if (contactEmail) contact.email = contactEmail;
  if (contactUrl) contact.url = contactUrl;

  const license = { name: licenseName };
  if (licenseUrl) license.url = licenseUrl;

  const servers = [{ url: '/', description: 'Same-origin (Nginx / voicehub.local)' }];
  if (serverUrl) {
    servers.unshift({ url: serverUrl, description: 'Configured SWAGGER_SERVER_URL' });
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'VoiceHub API',
      description:
        'Public HTTP surface qua API Gateway.\n\n' +
        '- **Authorize**: Bearer JWT từ `POST /api/auth/login`\n' +
        '- **Try it out** trên từng operation\n' +
        '- Download: [/api/docs.json](/api/docs.json) · [/api/docs.yaml](/api/docs.yaml)\n' +
        '- Internal S2S (`/internal/*`) không document trên UI này.',
      version,
      contact,
      license,
    },
    servers,
    tags: MODULE_TAGS,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token — header Authorization: Bearer <token>',
        },
      },
      schemas: {
        ...common,
        PageResponse: pagination.PageResponse,
        CursorPageResponse: pagination.CursorPageResponse,
        ...auth,
        ...upload,
      },
      responses: {
        BadRequest: {
          description: 'Validation / bad request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorBody' },
              example: {
                success: false,
                message: 'Validation failed',
                errorCode: 'VALIDATION_REQUIRED',
                messageUser: 'Dữ liệu không hợp lệ.',
                errors: [{ field: 'email', message: 'must be a valid email' }],
              },
            },
          },
        },
        Unauthorized: {
          description: 'Missing or invalid JWT',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
              example: {
                success: false,
                message: 'Unauthorized',
                errorCode: 'AUTH_NO_TOKEN',
                messageUser: 'Vui lòng đăng nhập lại.',
              },
            },
          },
        },
        Forbidden: {
          description: 'Authenticated but not allowed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
              example: {
                success: false,
                message: 'Forbidden',
                errorCode: 'ORG_ACCESS_DENIED',
                messageUser: 'Bạn không có quyền thực hiện thao tác này.',
              },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
              example: {
                success: false,
                message: 'Not found',
                errorCode: 'NOT_FOUND',
                messageUser: 'Không tìm thấy tài nguyên.',
              },
            },
          },
        },
        InternalError: {
          description: 'Server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
              example: {
                success: false,
                message: 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.',
                errorCode: 'GATEWAY_INTERNAL_ERROR',
                messageUser: 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.',
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {},
  };
}

module.exports = {
  buildOpenApiBase,
  MODULE_TAGS,
};
