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

router.use(authenticateOrInternal);

router.post('/', requireOrgRoleManager, roleController.createRole.bind(roleController));
router.get(
  '/server/:serverId',
  requireOrgMember,
  roleController.getRolesByServer.bind(roleController)
);
router.post('/assign', requireOrgRoleManager, roleController.assignRoleToUser.bind(roleController));
router.post('/remove', requireOrgRoleManager, roleController.removeRoleFromUser.bind(roleController));
router.get(
  '/user/:userId/server/:serverId',
  requireSelfOrOrgManager,
  roleController.getUserRoles.bind(roleController)
);
router.get('/:roleId', requireRolePermission('role:read'), roleController.getRoleById.bind(roleController));
router.patch('/:roleId', requireOrgRoleManager, roleController.updateRole.bind(roleController));
router.put('/:roleId', requireOrgRoleManager, roleController.updateRole.bind(roleController));
router.delete('/:roleId', requireOrgRoleManager, roleController.deleteRole.bind(roleController));

module.exports = router;
