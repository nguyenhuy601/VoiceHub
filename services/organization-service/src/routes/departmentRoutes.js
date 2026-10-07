const express = require('express');
const router = express.Router({ mergeParams: true });
const departmentController = require('../controllers/departmentController');
const { protect, authorizeOrGrant } = require('../middleware/auth');
const { requireOrgReadAccess } = require('../middleware/requireOrgReadAccess');
const { registerObjectIdParams, requireMountedObjectIds } = require('../middleware/objectIdParam');

router.use(protect);
router.use(requireMountedObjectIds(['orgId']));
registerObjectIdParams(router, ['id']);

router.get('/', requireOrgReadAccess, departmentController.getDepartments);
router.post('/', authorizeOrGrant(['owner', 'admin'], 'organization.department.create'), departmentController.createDepartment);
router.put('/:id', authorizeOrGrant(['owner', 'admin'], 'organization.department.update'), departmentController.updateDepartment);
router.delete('/:id', authorizeOrGrant(['owner', 'admin'], 'organization.department.delete'), departmentController.deleteDepartment);

module.exports = router;
