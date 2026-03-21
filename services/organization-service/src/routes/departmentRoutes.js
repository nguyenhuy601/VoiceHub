const express = require('express');
const router = express.Router({ mergeParams: true });
const departmentController = require('../controllers/departmentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', departmentController.getDepartments);
router.post('/', authorize(['owner', 'admin']), departmentController.createDepartment);
router.put('/:id', authorize(['owner', 'admin']), departmentController.updateDepartment);
router.delete('/:id', authorize(['owner', 'admin']), departmentController.deleteDepartment);

module.exports = router;
