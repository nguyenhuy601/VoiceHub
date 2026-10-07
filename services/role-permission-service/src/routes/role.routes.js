const express = require('express');
const router = express.Router();
const authenticateOrInternal = require('../middleware/authenticateOrInternal');
const { requireRolePermission } = require('../middleware/requireRoleAccess');
const {
  requireOrgMember,
  requireOrgRoleManager,
  requireSelfOrOrgManager,
} = require('../middleware/requireOrgRoleManager');
const roleController = require('../controllers/role.controller');
const rbacWriteLimit = require('../middleware/rbacWriteLimit');

router.use(authenticateOrInternal);

router.post('/', requireOrgRoleManager, rbacWriteLimit, roleController.createRole.bind(roleController));
router.get(
  '/server/:serverId',
  requireOrgMember,
  roleController.getRolesByServer.bind(roleController)
);
router.post('/assign', requireOrgRoleManager, rbacWriteLimit, roleController.assignRoleToUser.bind(roleController));
router.post('/remove', requireOrgRoleManager, rbacWriteLimit, roleController.removeRoleFromUser.bind(roleController));
router.get(
  '/user/:userId/server/:serverId',
  requireSelfOrOrgManager,
  roleController.getUserRoles.bind(roleController)
);
router.get('/:roleId', requireRolePermission('role:read'), roleController.getRoleById.bind(roleController));
router.patch('/:roleId', requireOrgRoleManager, rbacWriteLimit, roleController.updateRole.bind(roleController));
router.put('/:roleId', requireOrgRoleManager, rbacWriteLimit, roleController.updateRole.bind(roleController));
router.delete('/:roleId', requireOrgRoleManager, rbacWriteLimit, roleController.deleteRole.bind(roleController));

module.exports = router;
