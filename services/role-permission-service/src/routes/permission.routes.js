const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');
const internalGatewayAuth = require('../middleware/internalGatewayAuth');
const { authenticate } = require('@enterprise/shared/middleware/auth');
const { requireSelfOrOrgManager } = require('../middleware/requireOrgRoleManager');

// Kiểm tra quyền truy cập (chỉ API Gateway — header nội bộ)
router.post(
  '/check',
  internalGatewayAuth,
  permissionController.checkPermission.bind(permissionController)
);

// Lấy permissions của user trong server
router.get(
  '/user/:userId/server/:serverId',
  authenticate,
  requireSelfOrOrgManager,
  permissionController.getUserPermissions.bind(permissionController)
);

// Lấy role của user trong server
router.get(
  '/user/:userId/server/:serverId/role',
  authenticate,
  requireSelfOrOrgManager,
  permissionController.getUserRole.bind(permissionController)
);

module.exports = router;



