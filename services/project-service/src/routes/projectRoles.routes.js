const express = require('express');

const router = express.Router();
const projectRolesController = require('../controllers/projectRoles.controller');

// Org Project Role catalog CRUD — mount at /api/projects/roles
router.get('/', projectRolesController.listProjectRoles);
router.post('/', projectRolesController.createProjectRole);
router.put('/reorder', projectRolesController.reorderProjectRoles);
router.patch('/:roleId', projectRolesController.updateProjectRole);
router.delete('/:roleId', projectRolesController.deleteProjectRole);

module.exports = router;
