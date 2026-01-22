/**
 * Mapping routes và HTTP methods thành actions
 * Route pattern -> Action mapping
 */
const routeActionMap = {
  // Chat Service
  'GET /api/messages': 'chat:read',
  'POST /api/messages': 'chat:write',
  'PATCH /api/messages': 'chat:write',
  'DELETE /api/messages': 'chat:delete',

  // Task Service
  'GET /api/tasks': 'task:read',
  'POST /api/tasks': 'task:write',
  'PATCH /api/tasks': 'task:write',
  'DELETE /api/tasks': 'task:delete',
  'GET /api/work': 'task:read',
  'POST /api/work': 'task:write',

  // Document Service
  'GET /api/documents': 'document:read',
  'POST /api/documents': 'document:write',
  'DELETE /api/documents': 'document:delete',

  // Voice Service
  'GET /api/voice': 'voice:read',
  'POST /api/voice': 'voice:write',
  'GET /api/meetings': 'voice:read',
  'POST /api/meetings': 'voice:write',

  // Organization Service
  'GET /api/organizations': 'organization:read',
  'POST /api/organizations': 'organization:write',
  'PATCH /api/organizations': 'organization:write',
  'DELETE /api/organizations': 'organization:delete',
  'GET /api/servers': 'server:read',
  'POST /api/servers': 'server:write',
  'PATCH /api/servers': 'server:write',
  'DELETE /api/servers': 'server:delete',

  // User Service (thường không cần server context)
  'GET /api/users': 'user:read',
  'PATCH /api/users': 'user:write',

  // Friend Service (không cần server context)
  'GET /api/friends': 'friend:read',
  'POST /api/friends': 'friend:write',
};

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
  '/api/auth/me',
  '/api/users/me',
  '/api/friends',
  '/api/notifications',
];

/**
 * Lấy action từ route và method
 * @param {string} method - HTTP method
 * @param {string} path - Route path
 * @returns {string|null} Action hoặc null nếu không cần check
 */
const getAction = (method, path) => {
  // Kiểm tra routes không cần permission
  if (noPermissionRoutes.some((route) => path.startsWith(route))) {
    return null;
  }

  const key = `${method} ${path.split('?')[0]}`;
  
  // Tìm exact match trước
  if (routeActionMap[key]) {
    return routeActionMap[key];
  }

  // Tìm pattern match
  for (const [pattern, action] of Object.entries(routeActionMap)) {
    const [patternMethod, patternPath] = pattern.split(' ');
    
    if (patternMethod === method && path.startsWith(patternPath)) {
      return action;
    }
  }

  // Default action nếu không match
  return `${method.toLowerCase()}:default`;
};

/**
 * Extract serverId từ request
 * @param {Object} req - Express request object
 * @returns {string|null} Server ID hoặc null
 */
const extractServerId = (req) => {
  // Ưu tiên: query > params > body > header
  // Sử dụng optional chaining để tránh lỗi khi req.body undefined
  return (
    req.query?.serverId ||
    req.query?.organizationId ||
    req.params?.serverId ||
    req.params?.organizationId ||
    req.body?.serverId ||
    req.body?.organizationId ||
    req.headers['x-server-id'] ||
    req.headers['x-organization-id'] ||
    null
  );
};

module.exports = {
  getAction,
  extractServerId,
  noPermissionRoutes,
};



