const roleService = require('../services/role.service');
const {
  getAction,
  extractServerId,
  isNoPermissionRoute,
  isTaskAuthBypassRoute,
  isDownstreamAuthorizedRoute,
  isSelfRoleReadRequest,
  isOrgRoleCatalogRead,
  isDelegatedUserRoleRead,
  isDelegatedUserPermissionRead,
  isDelegatedRoleManageRoute,
} = require('../config/permissions');
const { isPublicRoute, isAuthInternalS2SPath, resolveReqApiPath } = require('../config/services');
const { sendApiError, GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');

const DENY_UNMAPPED = String(process.env.PERMISSION_DENY_UNMAPPED || 'true').trim() !== 'false';

/** Cache kết quả checkPermission (giảm tải role-service) */
const permissionCache = new Map();
const CACHE_TTL_MS = Math.max(5000, parseInt(process.env.GATEWAY_PERMISSION_CACHE_TTL_MS || '15000', 10) || 15000);

function cacheKey(userId, serverId, action) {
  return `${userId}|${serverId}|${action}`;
}

/**
 * Middleware kiểm tra quyền truy cập
 * Gọi Role Service để check permission
 */
const permissionMiddleware = async (req, res, next) => {
  try {
    const apiPath = resolveReqApiPath(req);
    const pathOnly = String(req.originalUrl || req.url || req.path || '')
      .split('?')[0]
      .replace(/\/+/g, '/');

    // Bỏ qua routes public và routes chỉ cần JWT (service đích tự authorize)
    if (
      isPublicRoute(apiPath) ||
      isPublicRoute(req.path) ||
      isNoPermissionRoute(apiPath) ||
      isNoPermissionRoute(req.path)
    ) {
      return next();
    }

    // Bootstrap S2S — auth-service tự internalGatewayAuth; không cần req.user ở gateway
    if (isAuthInternalS2SPath(apiPath) || isAuthInternalS2SPath(req.path)) {
      return next();
    }

    // Lấy userId từ req.user (đã được set bởi authMiddleware)
    const userId = req.user?.id;
    if (!userId) {
      return sendApiError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        message: 'Unauthorized',
        messageUser: 'Vui lòng đăng nhập lại.',
      });
    }

    // Task / Work / AI-task / workspace boards — task-service tự authorize.
    if (isTaskAuthBypassRoute(apiPath) || isTaskAuthBypassRoute(pathOnly)) {
      return next();
    }

    // Lấy action từ route và method (chuẩn hóa /api prefix)
    const action = getAction(req.method, apiPath);

    if (!action) {
      // null action = không cần role-service HOẶC chưa map — phân biệt rõ
      if (isNoPermissionRoute(apiPath) || isNoPermissionRoute(req.path)) {
        return next();
      }
      if (isDownstreamAuthorizedRoute(apiPath) || isDownstreamAuthorizedRoute(pathOnly)) {
        return next();
      }
      console.warn(
        `[permission] unmapped route${DENY_UNMAPPED ? ' denied' : ' (log-only)'}:`,
        req.method,
        pathOnly
      );
      if (!DENY_UNMAPPED) {
        return next();
      }
      return sendApiError(res, 403, {
        errorCode: 'ROUTE_NOT_PERMITTED',
        message: 'Route not permitted',
        messageUser: 'Route chưa được cấp quyền tại gateway.',
      });
    }

    // Organization permissions được kiểm tra tại organization-service theo membership thực tế.
    // Bỏ qua check role-service ở gateway để tránh false deny do khác ngữ cảnh serverId.
    if (action.startsWith('organization:')) {
      return next();
    }

    // Voice/WebRTC MVP hiện chưa gắn role-context theo organization/server cho từng event.
    // Cho phép gateway bỏ qua permission check để tránh chặn bootstrap/join room.
    if (action.startsWith('voice:')) {
      return next();
    }

    const pathWithoutQuery = req.path.split('?')[0];
    const isOrganizationGlobalRoute =
      (req.method === 'GET' && pathWithoutQuery === '/api/organizations/my') ||
      (req.method === 'POST' && pathWithoutQuery === '/api/organizations');
    if (isOrganizationGlobalRoute) {
      return next();
    }
    
    // Extract serverId từ request
    const serverId = extractServerId(req);

    // Phân biệt 2 loại chat:
    // - Chat bạn bè (DM): dùng /api/messages (hoặc /messages) → KHÔNG cần serverId/organizationId
    // - Chat doanh nghiệp: dùng /api/chat/... → cần serverId/organizationId để check role
    // Dựa cả vào action mapping và path thực tế để tránh lệch config
    const isMessagesPath =
      req.path.startsWith('/api/messages') ||
      req.path.startsWith('/messages') ||
      req.path.startsWith('/api/chat/messages') ||
      req.path.startsWith('/chat/messages');
    const isChatRoute = action.startsWith('chat:') || isMessagesPath;
    const hasOrgOrServer =
      req.query?.organizationId ||
      req.params?.organizationId ||
      req.body?.organizationId ||
      req.query?.serverId ||
      req.params?.serverId ||
      req.body?.serverId;
    const hasReceiverId =
      req.query?.receiverId ||
      req.params?.receiverId ||
      req.body?.receiverId;

    // Chat bạn bè (DM) dùng /api/messages:
    // Bất cứ request nào tới messages mà KHÔNG có serverId/organizationId
    // → coi là DM, bỏ qua permission context để tránh chặn FE.
    if (isMessagesPath && !hasOrgOrServer) {
      return next();
    }
    
    // Nếu không có serverId, có thể là global action (như friend, user profile)
    // Cho phép trong trường hợp này
    if (!serverId) {
      // Một số actions không cần serverId
      const globalActions = ['friend:', 'user:read', 'user:write'];
      if (globalActions.some((prefix) => action.startsWith(prefix))) {
        return next();
      }
      
      // Các actions khác cần serverId (bao gồm chat doanh nghiệp)
      return res.status(400).json({
        success: false,
        message: 'serverId or organizationId is required',
      });
    }

    if (
      isSelfRoleReadRequest(req, action) ||
      isOrgRoleCatalogRead(req, action) ||
      isDelegatedUserRoleRead(req, action) ||
      isDelegatedUserPermissionRead(req, action) ||
      isDelegatedRoleManageRoute(req, action)
    ) {
      return next();
    }

    const ck = cacheKey(userId, serverId, action);
    const now = Date.now();
    const hit = permissionCache.get(ck);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      if (hit.allowed) {
        return next();
      }
      return res.status(403).json({
        success: false,
        message: 'Permission denied',
        reason: hit.reason || 'You do not have permission to perform this action',
      });
    }

    const { allowed, reason } = await roleService.checkPermission(
      userId,
      serverId,
      action
    );

    permissionCache.set(ck, { allowed, reason, at: now });

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied',
        reason: reason || 'You do not have permission to perform this action',
      });
    }

    next();
  } catch (error) {
    console.error('Permission middleware error:', error);

    // Fail-closed: deny access khi có lỗi
    return sendApiError(res, 500, {
      errorCode: 'PERMISSION_CHECK_FAILED',
      message: 'Permission check failed',
      messageUser: GENERIC_5XX_MESSAGE,
    });
  }
};

module.exports = permissionMiddleware;



