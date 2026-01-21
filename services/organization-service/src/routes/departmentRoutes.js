const express = require('express');
const router = express.Router({ mergeParams: true });
const departmentController = require('../controllers/departmentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', departmentController.getDepartments);
router.post('/', authorize(['org_admin']), departmentController.createDepartment);
router.put('/:id', authorize(['org_admin', 'department_head']), departmentController.updateDepartment);
router.delete('/:id', authorize(['org_admin']), departmentController.deleteDepartment);

module.exports = router;
