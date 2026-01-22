const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organization.controller');

// Tạo organization mới
router.post('/', organizationController.createOrganization.bind(organizationController));

// Lấy organization theo ID
router.get('/:organizationId', organizationController.getOrganizationById.bind(organizationController));

// Cập nhật organization
router.patch('/:organizationId', organizationController.updateOrganization.bind(organizationController));
router.put('/:organizationId', organizationController.updateOrganization.bind(organizationController));

// Xóa organization
router.delete('/:organizationId', organizationController.deleteOrganization.bind(organizationController));

module.exports = router;



