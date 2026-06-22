/**
 * Mapping routes và HTTP methods thành actions
 * Route pattern -> Action mapping
 */
const routeActionMap = {
  // Chat Service
  'GET /api/messages': 'chat:read',
  'GET /api/messages/search': 'chat:read',
  'POST /api/messages': 'chat:write',
  'POST /api/messages/storage/signed-upload': 'chat:write',
  'PATCH /api/messages': 'chat:write',
  'DELETE /api/messages': 'chat:delete',
  'GET /api/chat/messages': 'chat:read',
  'POST /api/chat/messages': 'chat:write',
  'POST /api/chat/messages/storage/signed-upload': 'chat:write',
  'PATCH /api/chat/messages': 'chat:write',
  'DELETE /api/chat/messages': 'chat:delete',

  // Task Service
  'GET /api/tasks': 'task:read',
  'POST /api/tasks': 'task:write',
  'PUT /api/tasks': 'task:write',
  'PATCH /api/tasks': 'task:write',
  'DELETE /api/tasks': 'task:delete',
  'GET /api/work': 'task:read',
  'POST /api/work': 'task:write',

  // AI Task Service
  'POST /api/ai/tasks/extract': 'task:write',
  'GET /api/ai/tasks/extractions': 'task:read',
  'POST /api/ai/tasks/confirm': 'task:write',

  // Document Service
  'GET /api/documents': 'document:read',
  'POST /api/documents': 'document:write',
  'PUT /api/documents': 'document:write',
  'PATCH /api/documents': 'document:write',
  'DELETE /api/documents': 'document:delete',

  // Voice Service
  'GET /api/voice': 'voice:read',
  'POST /api/voice': 'voice:write',
  'GET /api/meetings': 'voice:read',
  'POST /api/meetings': 'voice:write',

  // Role & Permission Service
  'GET /api/roles/server/:serverId': 'role:read',
  'GET /api/roles/:roleId': 'role:read',
  'GET /api/roles/user/:userId/server/:serverId': 'role:read',
  'POST /api/roles': 'role:write',
  'POST /api/roles/assign': 'role:write',
  'POST /api/roles/remove': 'role:write',
  'PATCH /api/roles/:roleId': 'role:write',
  'PUT /api/roles/:roleId': 'role:write',
  'DELETE /api/roles/:roleId': 'role:write',
  'GET /api/permissions/user/:userId/server/:serverId': 'role:read',
  'GET /api/permissions/user/:userId/server/:serverId/role': 'role:read',

  // Organization Service
  'GET /api/organizations': 'organization:read',
  'POST /api/organizations': 'organization:write',
  'PUT /api/organizations': 'organization:write',
  'PATCH /api/organizations': 'organization:write',
  'DELETE /api/organizations': 'organization:delete',
  'GET /api/organizations/my': 'organization:read',
  'GET /api/organizations/:orgId/departments': 'organization:read',
  'POST /api/organizations/:orgId/departments': 'organization:write',
  'PUT /api/organizations/:orgId/departments': 'organization:write',
  'DELETE /api/organizations/:orgId/departments': 'organization:delete',
  'GET /api/organizations/:orgId/members': 'organization:read',
  'POST /api/organizations/:orgId/members/leave': 'organization:read',
  'POST /api/organizations/:orgId/members': 'organization:write',
  'PUT /api/organizations/:orgId/members': 'organization:write',
  'DELETE /api/organizations/:orgId/members': 'organization:delete',
  'GET /api/organizations/:orgId/departments/:deptId/channels': 'organization:read',
  'POST /api/organizations/:orgId/departments/:deptId/channels': 'organization:write',
  'PUT /api/organizations/:orgId/departments/:deptId/channels': 'organization:write',
  'DELETE /api/organizations/:orgId/departments/:deptId/channels': 'organization:delete',
  'GET /api/organizations/:orgId/structure': 'organization:read',
  'GET /api/organizations/:orgId/accessible-channel-ids': 'organization:read',
  'GET /api/organizations/:orgId/task-workspace-scope': 'organization:read',
  'GET /api/organizations/:orgId/channels/:channelId/access': 'organization:read',
  'POST /api/organizations/:orgId/channels/:channelId/access/grant': 'organization:write',
  'POST /api/organizations/:orgId/channels/:channelId/access/revoke': 'organization:write',
  'GET /api/organizations/:orgId/channels/:channelId/role-access': 'organization:read',
  'PUT /api/organizations/:orgId/channels/:channelId/role-access': 'organization:write',
  'GET /api/organizations/:orgId/divisions/:divisionId/role-access': 'organization:read',
  'PUT /api/organizations/:orgId/divisions/:divisionId/role-access': 'organization:write',
  'GET /api/organizations/:orgId/departments/:departmentId/role-access': 'organization:read',
  'PUT /api/organizations/:orgId/departments/:departmentId/role-access': 'organization:write',
  'GET /api/organizations/:orgId/teams/:teamId/role-access': 'organization:read',
  'PUT /api/organizations/:orgId/teams/:teamId/role-access': 'organization:write',
  'GET /api/organizations/:orgId/hierarchy/teams/:teamId/role-access': 'organization:read',
  'PUT /api/organizations/:orgId/hierarchy/teams/:teamId/role-access': 'organization:write',

  // User Service (thường không cần server context)
  'GET /api/users': 'user:read',
  'PATCH /api/users': 'user:write',

  // Friend Service (không cần server context)
  'GET /api/friends': 'friend:read',
  'POST /api/friends': 'friend:write',

  // Organization BFF (sau permission middleware — org-service kiểm tra membership)
  'GET /api/organizations/:orgId/shell': 'organization:read',
  'GET /api/organizations/:orgId/documents-overview': 'organization:read',
};

/**
 * Prefixes cho phép proxy khi chưa có action map — service đích tự authorize.
 * Giữ đồng bộ với api-gateway/src/config/services.js proxy prefixes.
 */
const DOWNSTREAM_AUTH_PREFIXES = [
  '/api/voice',
  '/api/meetings',
  '/api/organizations',
  '/api/channels',
  '/api/tasks',
  '/api/work',
  '/api/ai/tasks',
  '/api/workspaces',
];

const TASK_AUTH_BYPASS_PREFIXES = [
  '/api/tasks',
  '/api/work',
  '/api/ai/tasks',
];

const TASK_AUTH_BYPASS_REGEX = /^\/api\/workspaces\/[^/]+\/task-boards(\/|$)/;

/**
 * Routes không cần kiểm tra permission (chỉ cần authentication)
 * Bao gồm:
 * - Auth routes (logout, change-password, me) - không cần server context
 * - User profile routes
 * - Friend routes
 * - Notification routes
 */
const noPermissionRoutes = [
  '/api/auth/logout',
  '/api/auth/change-password',
  '/api/auth/change-email/request',
  '/api/auth/me',
  // User profile & avatar không phụ thuộc server/organization
  '/api/users/me',
  '/api/users/avatar',
  '/api/bootstrap',
  '/api/dashboard/summary',
  // Friend routes không cần server context
  '/api/friends',
  '/api/notifications',
  '/api/organizations/my',
];

/**
 * Lấy action từ route và method
 * @param {string} method - HTTP method
 * @param {string} path - Route path
 * @returns {string|null} Action hoặc null nếu không cần check
 */
const ORG_SCOPED_ACTION_BY_METHOD = {
  GET: 'organization:read',
  HEAD: 'organization:read',
  POST: 'organization:write',
  PUT: 'organization:write',
  PATCH: 'organization:write',
  DELETE: 'organization:delete',
};

const normalizeToApiPath = (path = '') => {
  const sanitized = String(path || '').split('?')[0] || '/';
  return sanitized.startsWith('/api') ? sanitized : `/api${sanitized}`;
};

const normalizePathKey = (path = '') =>
  normalizeToApiPath(String(path || '').split('?')[0]).replace(/\/+/g, '/').toLowerCase();

function isNoPermissionRoute(path) {
  const pathWithoutQuery = String(path || '').split('?')[0];
  const apiPath = normalizeToApiPath(pathWithoutQuery);
  return noPermissionRoutes.some(
    (route) => pathWithoutQuery.startsWith(route) || apiPath.startsWith(route)
  );
}

function isTaskAuthBypassRoute(path) {
  const pathNorm = normalizePathKey(path);
  if (TASK_AUTH_BYPASS_PREFIXES.some((prefix) => pathNorm.startsWith(prefix))) {
    return true;
  }
  return TASK_AUTH_BYPASS_REGEX.test(pathNorm);
}

function isDownstreamAuthorizedRoute(path) {
  const pathNorm = normalizePathKey(path);
  return DOWNSTREAM_AUTH_PREFIXES.some((prefix) => pathNorm.startsWith(prefix));
}

/**
 * Phân loại route cho permission middleware (audit + smoke).
 * @returns {'public_skip'|'task_bypass'|'no_permission'|'action'|'downstream'|'unmapped'}
 */
function classifyPermissionRoute(method, path) {
  if (isNoPermissionRoute(path)) {
    return 'no_permission';
  }
  if (isTaskAuthBypassRoute(path)) {
    return 'task_bypass';
  }
  const action = getAction(method, path);
  if (action) {
    return 'action';
  }
  if (isDownstreamAuthorizedRoute(path)) {
    return 'downstream';
  }
  return 'unmapped';
}

const getAction = (method, path) => {
  const pathWithoutQuery = String(path || '').split('?')[0];
  const apiPath = normalizeToApiPath(pathWithoutQuery);

  // Kiểm tra routes không cần permission
  if (
    noPermissionRoutes.some(
      (route) => pathWithoutQuery.startsWith(route) || apiPath.startsWith(route)
    )
  ) {
    return null;
  }

  // Mọi route /api/organizations/:orgId/... (trừ /my) — organization-service tự kiểm tra membership/RBAC
  const orgScoped = apiPath.match(/^\/api\/organizations\/([^/]+)(?:\/|$)/);
  if (orgScoped && orgScoped[1] && orgScoped[1] !== 'my') {
    const scopedAction = ORG_SCOPED_ACTION_BY_METHOD[method];
    if (scopedAction) return scopedAction;
  }

  const key = `${method} ${apiPath}`;
  
  // Tìm exact match trước
  if (routeActionMap[key]) {
    return routeActionMap[key];
  }

  // Tìm pattern match (hỗ trợ dynamic params như :orgId, :deptId)
  for (const [pattern, action] of Object.entries(routeActionMap)) {
    const [patternMethod, patternPath] = pattern.split(' ');
    
    if (patternMethod !== method) {
      continue;
    }

    const patternRegex = new RegExp(
      `^${patternPath.replace(/:[^/]+/g, '[^/]+')}(?:/.*)?$`
    );

    if (patternRegex.test(apiPath)) {
      return action;
    }
  }

  return null;
};

/**
 * Extract serverId từ request
 * @param {Object} req - Express request object
 * @returns {string|null} Server ID hoặc null
 */
const extractServerId = (req) => {
  const path = req.path || '';
  const pathWithoutQuery = path.split('?')[0];
  const apiPath = normalizeToApiPath(pathWithoutQuery);
  const isOrganizationRoute = apiPath.startsWith('/api/organizations');
  const serverIdFromRolePath =
    apiPath.match(/^\/api\/roles\/server\/([^/]+)(?:\/|$)/)?.[1] || null;
  const serverIdFromPermissionPath =
    apiPath.match(/^\/api\/permissions\/user\/[^/]+\/server\/([^/]+)(?:\/|$)/)?.[1] ||
    null;
  const serverIdFromUserRolePath =
    apiPath.match(/^\/api\/roles\/user\/[^/]+\/server\/([^/]+)(?:\/|$)/)?.[1] || null;
  const organizationIdFromPath =
    apiPath.match(/^\/api\/organizations\/([^/]+)(?:\/|$)/)?.[1] || null;
  const normalizedOrgId =
    organizationIdFromPath && organizationIdFromPath !== 'my' ? organizationIdFromPath : null;
  const normalizedServerIdFromPath =
    serverIdFromRolePath || serverIdFromPermissionPath || serverIdFromUserRolePath;

  // Ưu tiên: query > params > body > header
  // Sử dụng optional chaining để tránh lỗi khi req.body undefined
  return (
    req.query?.serverId ||
    req.query?.organizationId ||
    (isOrganizationRoute ? req.query?.orgId : null) ||
    normalizedServerIdFromPath ||
    req.params?.serverId ||
    req.params?.organizationId ||
    req.params?.orgId ||
    req.params?.id ||
    normalizedOrgId ||
    req.body?.serverId ||
    req.body?.organizationId ||
    (isOrganizationRoute ? req.body?.orgId : null) ||
    null
  );
};

/**
 * GET quyền/role của chính mình — không yêu cầu role:read (tránh vòng gà-trứng khi chưa gán role).
 */
function roleReadPath(req) {
  return String(req.originalUrl || req.url || req.path || '')
    .split('?')[0]
    .replace(/\/+/g, '/');
}

/** GET quyền/role của chính mình — không yêu cầu role:read (tránh vòng gà-trứng khi chưa gán role). */
function isSelfRoleReadRequest(req, action) {
  if (action !== 'role:read' || req.method !== 'GET') return false;
  const actorId = String(req.user?.id || '').trim();
  if (!actorId) return false;
  const pathOnly = roleReadPath(req);
  const patterns = [
    /^\/api\/permissions\/user\/([^/]+)\/server\/[^/]+(?:\/role)?\/?$/,
    /^\/api\/roles\/user\/([^/]+)\/server\/[^/]+\/?$/,
  ];
  return patterns.some((re) => {
    const m = pathOnly.match(re);
    return m && String(m[1]).trim() === actorId;
  });
}

/**
 * GET danh sách role template trong org — kiểm tra membership tại role-permission-service.
 */
function isOrgRoleCatalogRead(req, action) {
  if (action !== 'role:read' || req.method !== 'GET') return false;
  return /^\/api\/roles\/server\/[^/]+\/?$/.test(roleReadPath(req));
}

/**
 * Đọc role của user (self hoặc org admin) — kiểm tra tại role-permission-service.
 */
function isDelegatedUserRoleRead(req, action) {
  if (action !== 'role:read' || req.method !== 'GET') return false;
  return /^\/api\/roles\/user\/[^/]+\/server\/[^/]+\/?$/.test(roleReadPath(req));
}

/**
 * Đọc permissions của user (self hoặc org admin) — kiểm tra tại role-permission-service.
 */
function isDelegatedUserPermissionRead(req, action) {
  if (action !== 'role:read' || req.method !== 'GET') return false;
  return /^\/api\/permissions\/user\/[^/]+\/server\/[^/]+(?:\/role)?\/?$/.test(roleReadPath(req));
}

/**
 * CRUD role + gán/gỡ — org owner/admin qua requireOrgRoleManager tại role-service,
 * không cần role:write RBAC trước (tránh vòng gà-trứng cho admin tổ chức).
 */
function isDelegatedRoleManageRoute(req, action) {
  if (action !== 'role:write') return false;
  const path = roleReadPath(req);
  const method = req.method;
  if (method === 'POST') {
    return path === '/api/roles' || path === '/api/roles/assign' || path === '/api/roles/remove';
  }
  if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') {
    return /^\/api\/roles\/[^/]+\/?$/.test(path);
  }
  return false;
}

/** Các path client thực tế — smoke test không được `unmapped`. */
const AUDITED_CLIENT_API_PATHS = [
  ['GET', '/api/bootstrap'],
  ['GET', '/api/dashboard/summary'],
  ['GET', '/api/users/me'],
  ['GET', '/api/users/search'],
  ['GET', '/api/users/abc123'],
  ['GET', '/api/friends'],
  ['GET', '/api/notifications'],
  ['GET', '/api/messages'],
  ['GET', '/api/messages/unread/org'],
  ['POST', '/api/messages'],
  ['GET', '/api/documents'],
  ['PATCH', '/api/documents/doc1'],
  ['GET', '/api/organizations/my'],
  ['GET', '/api/organizations/org1/shell'],
  ['GET', '/api/organizations/org1/structure'],
  ['GET', '/api/tasks'],
  ['POST', '/api/ai/tasks/extract'],
  ['GET', '/api/voice/calls/active'],
  ['GET', '/api/meetings'],
  ['GET', '/api/roles/server/org1'],
  ['GET', '/api/workspaces/ws1/task-boards'],
];

module.exports = {
  getAction,
  extractServerId,
  noPermissionRoutes,
  DOWNSTREAM_AUTH_PREFIXES,
  isNoPermissionRoute,
  isTaskAuthBypassRoute,
  isDownstreamAuthorizedRoute,
  classifyPermissionRoute,
  AUDITED_CLIENT_API_PATHS,
  isSelfRoleReadRequest,
  isOrgRoleCatalogRead,
  isDelegatedUserRoleRead,
  isDelegatedUserPermissionRead,
  isDelegatedRoleManageRoute,
};



