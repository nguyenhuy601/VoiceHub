const roleService = require('../services/role.service');
const { getAction, extractServerId, noPermissionRoutes } = require('../config/permissions');
const { isPublicRoute } = require('../config/services');

/**
 * Middleware kiểm tra quyền truy cập
 * Gọi Role Service để check permission
 */
const permissionMiddleware = async (req, res, next) => {
  try {
    // Bỏ qua routes public (đăng ký, đăng nhập, ...),
    // và các routes được đánh dấu không cần kiểm tra permission
    if (isPublicRoute(req.path) || noPermissionRoutes.some((route) => req.path.startsWith(route))) {
      return next();
    }

    // Lấy userId từ req.user (đã được set bởi authMiddleware)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Lấy action từ route và method
    const action = getAction(req.method, req.path);
    
    // Nếu không có action mapping, cho phép (có thể là route mới chưa config)
    if (!action) {
      console.warn(`No action mapping for ${req.method} ${req.path}`);
      return next();
    }

    // Extract serverId từ request
    const serverId = extractServerId(req);

    // Nếu không có serverId, có thể là global action (như friend, user profile)
    // Cho phép trong trường hợp này
    if (!serverId) {
      // Một số actions không cần serverId
      const globalActions = ['friend:', 'user:read', 'user:write'];
      if (globalActions.some((prefix) => action.startsWith(prefix))) {
        return next();
      }

      // Các actions khác cần serverId
      return res.status(400).json({
        success: false,
        message: 'serverId or organizationId is required',
      });
    }

    // Gọi Role Service để check permission
    const { allowed, reason } = await roleService.checkPermission(
      userId,
      serverId,
      action
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied',
        reason: reason || 'You do not have permission to perform this action',
      });
    }

    // Cho phép request tiếp tục
    next();
  } catch (error) {
    console.error('Permission middleware error:', error);
    
    // Fail-closed: deny access khi có lỗi
    return res.status(500).json({
      success: false,
      message: 'Permission check failed',
      error: error.message,
    });
  }
};

module.exports = permissionMiddleware;



