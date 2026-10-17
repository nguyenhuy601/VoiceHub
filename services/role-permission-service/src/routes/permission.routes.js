const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');
const rbacController = require('../controllers/rbac.controller');
const internalGatewayAuth = require('../middleware/internalGatewayAuth');
const { authenticate } = require('@enterprise/shared/middleware/auth');
const authenticateOrInternal = require('../middleware/authenticateOrInternal');
const {
  requireSelfOrOrgManager,
  requireOrgRoleManager,
} = require('../middleware/requireOrgRoleManager');
const rbacWriteLimit = require('../middleware/rbacWriteLimit');

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

// ----- RBAC (system permissions / groups / assign) -----
// Quyền hệ thống bất biến — chỉ cần đăng nhập (hoặc S2S).
router.get(
  '/system',
  authenticateOrInternal,
  rbacController.listSystemPermissions.bind(rbacController)
);
/** @deprecated Prefer GET /permissions/system */
router.get(
  '/catalog',
  authenticateOrInternal,
  rbacController.listSystemPermissions.bind(rbacController)
);

router.get(
  '/groups',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacController.listGroups.bind(rbacController)
);

router.post(
  '/groups/clone',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacWriteLimit,
  rbacController.cloneGroup.bind(rbacController)
);

router.patch(
  '/groups/:groupId',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacWriteLimit,
  rbacController.renameGroup.bind(rbacController)
);

router.put(
  '/groups/:groupId/grants',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacWriteLimit,
  rbacController.setGroupGrants.bind(rbacController)
);

router.get(
  '/roles/:roleId/groups',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacController.listRoleGroups.bind(rbacController)
);

router.put(
  '/roles/:roleId/groups',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacWriteLimit,
  rbacController.replaceRoleGroups.bind(rbacController)
);

router.post(
  '/direct-replace',
  authenticateOrInternal,
  requireOrgRoleManager,
  rbacWriteLimit,
  rbacController.directReplace.bind(rbacController)
);

/** Project-service S2S — Wave B Strict AND migration for Create Project */
router.post(
  '/internal/ensure-project-create-grant',
  internalGatewayAuth,
  rbacController.ensureProjectCreateGrant.bind(rbacController)
);

module.exports = router;
