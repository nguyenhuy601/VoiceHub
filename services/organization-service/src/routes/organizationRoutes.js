const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // All routes require authentication

router.get('/my', organizationController.getMyOrganizations);
router.post('/', organizationController.createOrganization);

router.get('/:id', organizationController.getOrganization);
router.put('/:id', authorize(['org_admin']), organizationController.updateOrganization);
router.delete('/:id', authorize(['org_admin']), organizationController.deleteOrganization);

module.exports = router;
