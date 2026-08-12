const express = require('express');

const router = express.Router();
const projectRoleAdminController = require('../controllers/projectRoleAdmin.controller');

// Admin CRUD Project Roles (catalog) — per-organization.
router.get('/', projectRoleAdminController.listProjectRoles.bind(projectRoleAdminController));
router.post('/', projectRoleAdminController.createProjectRole.bind(projectRoleAdminController));
router.put('/reorder', projectRoleAdminController.reorderProjectRoles.bind(projectRoleAdminController));
router.patch('/:roleId', projectRoleAdminController.updateProjectRole.bind(projectRoleAdminController));
router.delete('/:roleId', projectRoleAdminController.deleteProjectRole.bind(projectRoleAdminController));

module.exports = router;

