const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');
const rbacV2Controller = require('../controllers/rbacV2.controller');
const internalGatewayAuth = require('../middleware/internalGatewayAuth');
const { authenticate } = require('@enterprise/shared/middleware/auth');
const authenticateOrInternal = require('../middleware/authenticateOrInternal');
const {
  requireSelfOrOrgManager,
  requireOrgRoleManager,
} = require('../middleware/requireOrgRoleManager');

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

// ----- RBAC V2 (catalog / groups / assign) -----
// Catalog là hệ thống immutable — chỉ cần đăng nhập (hoặc S2S).
router.get(
  '/catalog',
  authenticateOrInternal,
  rbacV2Controller.getCatalog.bind(rbacV2Controller)
);

router.get(
  '/groups',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacV2Controller.listGroups.bind(rbacV2Controller)
);

router.post(
  '/groups/clone',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacV2Controller.cloneGroup.bind(rbacV2Controller)
);

router.patch(
  '/groups/:groupId',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacV2Controller.renameGroup.bind(rbacV2Controller)
);

router.put(
  '/groups/:groupId/grants',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacV2Controller.setGroupGrants.bind(rbacV2Controller)
);

router.get(
  '/roles/:roleId/groups',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacV2Controller.listRoleGroups.bind(rbacV2Controller)
);

router.put(
  '/roles/:roleId/groups',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacV2Controller.replaceRoleGroups.bind(rbacV2Controller)
);

router.post(
  '/direct-replace',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacV2Controller.directReplace.bind(rbacV2Controller)
);

module.exports = router;
